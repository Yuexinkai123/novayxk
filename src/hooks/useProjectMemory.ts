import React from "react";
import type { ChatMessage, ProjectMemoryState, TaskHistory } from "../vite-env";
import { sanitizeChatHistory, summarizeTaskForUi } from "../ai/chat";
import { formatActionableError } from "../app/errors";

const emptyMessages: ChatMessage[] = [];

type UseProjectMemoryOptions = {
  hasProject: boolean;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  setStatus: (status: string) => void;
  onMemorySaved: () => void;
};

export function useProjectMemory({
  hasProject,
  messages,
  setMessages,
  setStatus,
  onMemorySaved,
}: UseProjectMemoryOptions) {
  const [memoryState, setMemoryState] = React.useState<ProjectMemoryState | null>(null);
  const [projectMemoryDraft, setProjectMemoryDraft] = React.useState("");
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  const [activeTaskTitle, setActiveTaskTitle] = React.useState("New task");
  const [activeTaskSummary, setActiveTaskSummary] = React.useState("");
  const activeTask = memoryState?.tasks.find((task) => task.id === activeTaskId) ?? null;

  const refreshMemoryState = React.useCallback(async () => {
    if (!window.novayxk || !hasProject) return null;
    const state = await window.novayxk.getProjectMemoryState();
    setMemoryState(state);
    setProjectMemoryDraft(state.memory);
    return state;
  }, [hasProject]);

  const saveCurrentTask = React.useCallback(
    async (messagesToSave = messages): Promise<TaskHistory | null> => {
      if (!window.novayxk || !hasProject) return null;
      const cleanMessages = sanitizeChatHistory(messagesToSave);
      const task = await window.novayxk.saveTask({
        id: activeTaskId,
        title: !activeTaskId && activeTaskTitle === "New task" ? undefined : activeTaskTitle,
        summary: activeTaskSummary || summarizeTaskForUi(cleanMessages),
        messages: cleanMessages,
      });
      setActiveTaskId(task.id);
      setActiveTaskTitle(task.title);
      setActiveTaskSummary(task.summary);
      await refreshMemoryState();
      return task;
    },
    [activeTaskId, activeTaskSummary, activeTaskTitle, hasProject, messages, refreshMemoryState],
  );

  const saveCurrentTaskWithStatus = React.useCallback(async () => {
    try {
      const task = await saveCurrentTask(messages);
      if (task) setStatus(`Task history saved: ${task.title}`);
    } catch (error) {
      setStatus(formatActionableError(error, "Failed to save the task"));
    }
  }, [messages, saveCurrentTask, setStatus]);

  const startNewTask = React.useCallback(async () => {
    setActiveTaskId(null);
    setActiveTaskTitle("New task");
    setActiveTaskSummary("");
    setMessages(emptyMessages);
    setStatus("Started a new task history");
  }, [setMessages, setStatus]);

  const loadTask = React.useCallback(
    async (taskId: string) => {
      if (!taskId) return;
      try {
        if (!window.novayxk) {
          throw new Error("You are currently in browser preview mode. Task history requires the Electron app.");
        }
        const task = await window.novayxk.loadTask(taskId);
        setActiveTaskId(task.id);
        setActiveTaskTitle(task.title);
        setActiveTaskSummary(task.summary);
        setMessages(sanitizeChatHistory(task.messages));
        setStatus(`Task history loaded: ${task.title}`);
      } catch (error) {
        setStatus(formatActionableError(error, "Failed to load the task"));
      }
    },
    [setMessages, setStatus],
  );

  const saveProjectMemoryDraft = React.useCallback(async () => {
    try {
      if (!window.novayxk || !hasProject) {
        throw new Error("Open a project first.");
      }
      const state = await window.novayxk.saveProjectMemory(projectMemoryDraft);
      setMemoryState(state);
      setProjectMemoryDraft(state.memory);
      onMemorySaved();
      setStatus("Project long-term memory saved");
    } catch (error) {
      setStatus(formatActionableError(error, "Failed to save project memory"));
    }
  }, [hasProject, onMemorySaved, projectMemoryDraft, setStatus]);

  const hydrateProjectMemory = React.useCallback(async () => {
    const memory = await window.novayxk?.getProjectMemoryState();
    if (!memory) return;

    setMemoryState(memory);
    setProjectMemoryDraft(memory.memory);
    if (memory.tasks[0]) {
      const task = await window.novayxk?.loadTask(memory.tasks[0].id);
      if (task) {
        setActiveTaskId(task.id);
        setActiveTaskTitle(task.title);
        setActiveTaskSummary(task.summary);
        setMessages(sanitizeChatHistory(task.messages));
      }
    } else {
      setActiveTaskId(null);
      setActiveTaskTitle("New task");
      setActiveTaskSummary("");
      setMessages(emptyMessages);
    }
  }, [setMessages]);

  return {
    memoryState,
    projectMemoryDraft,
    setProjectMemoryDraft,
    activeTaskId,
    activeTaskTitle,
    setActiveTaskTitle,
    activeTaskSummary,
    activeTask,
    refreshMemoryState,
    saveCurrentTask,
    saveCurrentTaskWithStatus,
    startNewTask,
    loadTask,
    saveProjectMemoryDraft,
    hydrateProjectMemory,
  };
}
