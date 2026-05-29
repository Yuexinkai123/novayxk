package main

import (
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

const (
	appExe            = "Novayxk.exe"
	uninstallerExe    = "Novayxk Uninstaller.exe"
	maxDeleteAttempts = 12
)

var logPath = filepath.Join(os.TempDir(), "novayxk-uninstall-cleanup.log")

func main() {
	target := flag.String("target", "", "Novayxk install directory to remove")
	userData := flag.String("user-data", "", "Novayxk user data directory to remove")
	deleteUserData := flag.Bool("delete-user-data", false, "remove user data")
	waitPid := flag.Int("wait-pid", 0, "process id to wait for before cleanup")
	customLog := flag.String("log", "", "cleanup log path")
	flag.Parse()

	if strings.TrimSpace(*customLog) != "" {
		logPath = *customLog
	}

	logEvent("start", map[string]string{
		"target":         *target,
		"userData":       *userData,
		"deleteUserData": fmt.Sprintf("%v", *deleteUserData),
		"waitPid":        fmt.Sprintf("%d", *waitPid),
		"execPath":       os.Args[0],
	})

	if err := run(*target, *userData, *deleteUserData, *waitPid); err != nil {
		logEvent("fatal", map[string]string{"error": err.Error()})
		os.Exit(1)
	}

	logEvent("done", map[string]string{"ok": "true"})
}

func run(target string, userData string, deleteUserData bool, waitPid int) error {
	installDir, err := assertSafeInstallDir(target)
	if err != nil {
		return err
	}

	_ = os.Chdir(os.TempDir())
	waitForPid(waitPid, 25*time.Second)
	closeAppProcesses()
	time.Sleep(800 * time.Millisecond)

	if err := removeWithRetries(installDir, "installDir"); err != nil {
		return err
	}

	if deleteUserData {
		userDataDir, err := assertSafeUserDataDir(userData)
		if err != nil {
			return err
		}
		if err := removeWithRetries(userDataDir, "userData"); err != nil {
			return err
		}
	}

	return nil
}

func assertSafeInstallDir(target string) (string, error) {
	if strings.TrimSpace(target) == "" {
		return "", errors.New("missing uninstall target")
	}

	resolved, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}
	if err := assertNotBroadSystemPath(resolved); err != nil {
		return "", err
	}

	if _, err := os.Stat(resolved); errors.Is(err, os.ErrNotExist) {
		logEvent("target:missing", map[string]string{"target": resolved})
		return resolved, nil
	}

	markers := []string{
		filepath.Join(resolved, appExe),
		filepath.Join(resolved, uninstallerExe),
		filepath.Join(resolved, "resources", "app.asar"),
	}
	hasMarker := false
	for _, marker := range markers {
		if _, err := os.Stat(marker); err == nil {
			hasMarker = true
			break
		}
	}

	baseName := strings.ToLower(filepath.Base(resolved))
	if !hasMarker && !strings.Contains(baseName, "novayxk") {
		return "", fmt.Errorf("refusing to delete a directory without Novayxk markers: %s", resolved)
	}

	return resolved, nil
}

func assertSafeUserDataDir(target string) (string, error) {
	if strings.TrimSpace(target) == "" {
		return "", errors.New("missing user data target")
	}

	resolved, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}
	if err := assertNotBroadSystemPath(resolved); err != nil {
		return "", err
	}
	if strings.ToLower(filepath.Base(resolved)) != ".novayxk" {
		return "", fmt.Errorf("refusing to delete unexpected user data directory: %s", resolved)
	}

	return resolved, nil
}

func assertNotBroadSystemPath(target string) error {
	resolved := cleanComparePath(target)
	root := filepath.VolumeName(resolved) + string(os.PathSeparator)
	forbidden := []string{
		root,
		homeDir(),
		os.Getenv("SystemRoot"),
		os.Getenv("ProgramFiles"),
		os.Getenv("ProgramFiles(x86)"),
		os.Getenv("LOCALAPPDATA"),
		os.Getenv("APPDATA"),
	}

	for _, item := range forbidden {
		if item == "" {
			continue
		}
		if resolved == cleanComparePath(item) {
			return fmt.Errorf("refusing to delete broad system path: %s", target)
		}
	}
	return nil
}

func homeDir() string {
	home, _ := os.UserHomeDir()
	return home
}

func cleanComparePath(value string) string {
	abs, err := filepath.Abs(value)
	if err != nil {
		abs = value
	}
	return strings.ToLower(filepath.Clean(abs))
}

func closeAppProcesses() {
	for _, imageName := range []string{appExe, uninstallerExe} {
		output, err := runCommand("taskkill.exe", "/IM", imageName, "/F", "/T")
		status := "0"
		if err != nil {
			status = err.Error()
		}
		logEvent("taskkill", map[string]string{
			"imageName": imageName,
			"status":    status,
			"output":    trimOutput(output),
		})
	}
}

func waitForPid(pid int, maxWait time.Duration) {
	if pid <= 0 {
		return
	}

	deadline := time.Now().Add(maxWait)
	for time.Now().Before(deadline) {
		if !isPidAlive(pid) {
			logEvent("waitPid:exited", map[string]string{"pid": fmt.Sprintf("%d", pid)})
			return
		}
		time.Sleep(500 * time.Millisecond)
	}

	logEvent("waitPid:timeout", map[string]string{
		"pid":   fmt.Sprintf("%d", pid),
		"maxMs": fmt.Sprintf("%d", maxWait.Milliseconds()),
	})
}

func isPidAlive(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	if runtime.GOOS == "windows" {
		output, err := runCommand("tasklist.exe", "/FI", fmt.Sprintf("PID eq %d", pid))
		return err == nil && strings.Contains(output, fmt.Sprintf("%d", pid))
	}
	return process.Signal(syscall.Signal(0)) == nil
}

func removeWithRetries(target string, label string) error {
	for attempt := 1; attempt <= maxDeleteAttempts; attempt++ {
		if !pathExists(target) {
			logEvent("remove:missing", map[string]string{
				"label":   label,
				"target":  target,
				"attempt": fmt.Sprintf("%d", attempt),
			})
			return nil
		}

		clearReadonlyAttributes(target)

		if err := os.RemoveAll(target); err != nil {
			logEvent("remove:removeAll:failed", map[string]string{
				"label":   label,
				"target":  target,
				"attempt": fmt.Sprintf("%d", attempt),
				"error":   err.Error(),
			})
		}
		if !pathExists(target) {
			logEvent("remove:removeAll:done", map[string]string{
				"label":   label,
				"target":  target,
				"attempt": fmt.Sprintf("%d", attempt),
			})
			return nil
		}

		output, err := runCommand("cmd.exe", "/c", "rmdir", "/s", "/q", target)
		status := "0"
		if err != nil {
			status = err.Error()
		}
		logEvent("remove:rmdir", map[string]string{
			"label":   label,
			"target":  target,
			"attempt": fmt.Sprintf("%d", attempt),
			"status":  status,
			"output":  trimOutput(output),
		})
		if !pathExists(target) {
			logEvent("remove:rmdir:done", map[string]string{
				"label":   label,
				"target":  target,
				"attempt": fmt.Sprintf("%d", attempt),
			})
			return nil
		}

		time.Sleep(time.Duration(min(attempt*750, 5000)) * time.Millisecond)
	}

	return fmt.Errorf("failed to remove %s: %s", label, target)
}

func clearReadonlyAttributes(target string) {
	output, err := runCommand("attrib.exe", "-R", filepath.Join(target, "*"), "/S", "/D")
	if err != nil {
		logEvent("attrib:failed", map[string]string{
			"target": target,
			"error":  err.Error(),
			"output": trimOutput(output),
		})
	}

	_ = filepath.WalkDir(target, func(filePath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		_ = os.Chmod(filePath, 0o666)
		if entry.IsDir() {
			_ = os.Chmod(filePath, 0o777)
		}
		return nil
	})
}

func pathExists(target string) bool {
	_, err := os.Stat(target)
	return err == nil
}

func runCommand(name string, args ...string) (string, error) {
	command := exec.Command(name, args...)
	command.Dir = os.TempDir()
	if runtime.GOOS == "windows" {
		command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}
	output, err := command.CombinedOutput()
	return string(output), err
}

func logEvent(eventName string, fields map[string]string) {
	var builder strings.Builder
	builder.WriteString(time.Now().Format(time.RFC3339Nano))
	builder.WriteString(" [cleanup:")
	builder.WriteString(eventName)
	builder.WriteString("]")
	for key, value := range fields {
		builder.WriteString(" ")
		builder.WriteString(key)
		builder.WriteString("=")
		builder.WriteString(quoteLogValue(value))
	}
	builder.WriteString("\r\n")

	_ = os.MkdirAll(filepath.Dir(logPath), 0o755)
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = file.WriteString(builder.String())
}

func quoteLogValue(value string) string {
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	return fmt.Sprintf("%q", value)
}

func trimOutput(output string) string {
	normalized := strings.Join(strings.Fields(output), " ")
	if len(normalized) > 1200 {
		return normalized[:1200]
	}
	return normalized
}

func min(a int, b int) int {
	if a < b {
		return a
	}
	return b
}
