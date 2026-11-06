package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"silent-tab/internal/browsercontrol"
)

type Server struct {
	cfg    Config
	broker *browsercontrol.Broker
	http   *http.Server
}

func New(cfg Config) *Server {
	broker := browsercontrol.New(cfg.Token, cfg.AllowedDomains, cfg.AllowRemote)
	s := &Server{cfg: cfg, broker: broker}
	s.http = &http.Server{
		Addr:              cfg.Addr,
		Handler:           s.routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	return s
}

func (s *Server) ListenAndServe() error {
	return s.http.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	s.broker.Close()
	return s.http.Shutdown(ctx)
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "silent-tab"})
	})
	mux.Handle("GET /api/browser/ws", s.localOnly(http.HandlerFunc(s.broker.ServeWebSocket)))
	mux.Handle("POST /api/browser/local/chatgpt", s.localOnly(http.HandlerFunc(s.localChatGPT)))
	mux.Handle("POST /api/browser/local/chatgpt/stream", s.localOnly(http.HandlerFunc(s.localChatGPTStream)))
	mux.Handle("GET /api/browser/status", s.localOnly(s.authorized(http.HandlerFunc(s.status))))
	mux.Handle("POST /api/browser/tasks", s.localOnly(s.authorized(http.HandlerFunc(s.task))))
	mux.Handle("POST /api/browser/chatgpt/stream", s.localOnly(s.authorized(http.HandlerFunc(s.chatGPTStream))))
	return mux
}

func (s *Server) localOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.broker.AllowRequest(r.RemoteAddr) {
			writeJSON(w, http.StatusForbidden, browsercontrol.Response{OK: false, Error: "Silent Tab only accepts local clients", Code: "LOCAL_ONLY"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) authorized(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") || !s.broker.TokenValid(strings.TrimSpace(header[7:])) {
			writeJSON(w, http.StatusUnauthorized, browsercontrol.Response{OK: false, Error: "invalid Silent Tab token", Code: "UNAUTHORIZED"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) status(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.broker.Status())
}

func (s *Server) task(w http.ResponseWriter, r *http.Request) {
	var request browsercontrol.TaskRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	writeTaskResult(w, s.broker.Dispatch(r.Context(), request))
}

type localChatGPTRequest struct {
	Text            string `json:"text"`
	TimeoutMS       int    `json:"timeout_ms,omitempty"`
	NewConversation bool   `json:"new_conversation,omitempty"`
	Background      *bool  `json:"background,omitempty"`
}

func (request localChatGPTRequest) taskRequest() browsercontrol.TaskRequest {
	background := true
	if request.Background != nil {
		background = *request.Background
	}
	params, _ := json.Marshal(map[string]any{
		"text":             request.Text,
		"new_conversation": request.NewConversation,
		"active":           !background,
	})
	return browsercontrol.TaskRequest{Action: "chatgpt.send_message", TimeoutMS: request.TimeoutMS, Params: params}
}

func (s *Server) localChatGPT(w http.ResponseWriter, r *http.Request) {
	var request localChatGPTRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	writeTaskResult(w, s.broker.Dispatch(r.Context(), request.taskRequest()))
}

func (s *Server) chatGPTStream(w http.ResponseWriter, r *http.Request) {
	var request browsercontrol.TaskRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Action = "chatgpt.send_message"
	s.stream(w, r, request)
}

func (s *Server) localChatGPTStream(w http.ResponseWriter, r *http.Request) {
	var request localChatGPTRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	s.stream(w, r, request.taskRequest())
}

func (s *Server) stream(w http.ResponseWriter, r *http.Request, request browsercontrol.TaskRequest) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, browsercontrol.Response{OK: false, Error: "streaming is not supported", Code: "STREAM_UNAVAILABLE"})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()
	for event := range s.broker.DispatchStream(r.Context(), request) {
		payload, err := json.Marshal(event)
		if err != nil {
			continue
		}
		_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, payload)
		flusher.Flush()
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeJSON(w, http.StatusBadRequest, browsercontrol.Response{OK: false, Error: "invalid JSON body", Code: "INVALID_JSON"})
		return false
	}
	return true
}

func writeTaskResult(w http.ResponseWriter, result browsercontrol.Response) {
	status := http.StatusOK
	if !result.OK {
		switch result.Code {
		case "INVALID_TASK", "DUPLICATE_TASK":
			status = http.StatusBadRequest
		case "BROWSER_OFFLINE", "BROWSER_DISCONNECTED", "BROWSER_WRITE_FAILED":
			status = http.StatusServiceUnavailable
		case "TASK_TIMEOUT":
			status = http.StatusGatewayTimeout
		default:
			status = http.StatusUnprocessableEntity
		}
	}
	writeJSON(w, status, result)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
