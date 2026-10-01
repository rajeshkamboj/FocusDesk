import type { AppData, Settings } from '../types';

export const defaultSettings: Settings = {
  general: {
    startOnToday: true,
    confirmTaskDeletion: true,
    automaticCarryForward: true,
    defaultTaskDuration: 30,
  },
  notifications: {
    morningPriorityReminder: true,
    taskReminders: true,
    deadlineReminders: true,
    eveningReviewReminder: true,
  },
  appearance: {
    theme: 'system',
  },
};

/**
 * An empty world. The application ships with zero user content —
 * projects, goals, tasks and ideas are created by the user only.
 */
export function emptyData(): AppData {
  return {
    tasks: [],
    projects: [],
    goals: [],
    inbox: [],
    ideas: [],
    dailyPriorities: [],
    weeklyPriorities: [],
    monthlyPriorities: [],
    taskHistory: [],
    wellbeingDays: [],
    settings: { ...defaultSettings, general: { ...defaultSettings.general }, notifications: { ...defaultSettings.notifications }, appearance: { ...defaultSettings.appearance } },
  };
}
