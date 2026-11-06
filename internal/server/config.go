package server

import (
	"fmt"
	"net"
	"os"
	"strings"
)

// Config 描述 Silent Tab 守护进程所需的最小配置。
type Config struct {
	Addr           string
	Token          string
	AllowedDomains []string
	AllowRemote    bool
}

func LoadConfig() (Config, error) {
	cfg := Config{
		Addr:           envOr("SILENT_TAB_ADDR", "127.0.0.1:8765"),
		Token:          strings.TrimSpace(os.Getenv("SILENT_TAB_TOKEN")),
		AllowedDomains: splitCSV(envOr("SILENT_TAB_ALLOWED_DOMAINS", "localhost,127.0.0.1,chatgpt.com,chat.openai.com")),
		AllowRemote:    os.Getenv("SILENT_TAB_ALLOW_REMOTE") == "1",
	}
	if cfg.Token == "" {
		return Config{}, fmt.Errorf("SILENT_TAB_TOKEN is required")
	}
	if err := validateAddress(cfg.Addr, cfg.AllowRemote); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func splitCSV(raw string) []string {
	result := make([]string, 0)
	for _, value := range strings.Split(raw, ",") {
		if value = strings.TrimSpace(value); value != "" {
			result = append(result, value)
		}
	}
	return result
}

func validateAddress(address string, allowRemote bool) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("invalid SILENT_TAB_ADDR: %w", err)
	}
	if allowRemote || host == "localhost" {
		return nil
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	if ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("SILENT_TAB_ADDR must be loopback unless SILENT_TAB_ALLOW_REMOTE=1")
	}
	return nil
}
