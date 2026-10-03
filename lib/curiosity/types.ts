export type CuriosityNewsItem = {
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
};

export type DeveloperDiscovery = {
  name: string;
  description: string;
  why: string;
  pricing: string;
  url: string;
};

export type CuriosityBriefing = {
  date: string;
  aiWorld: CuriosityNewsItem[];
  developerRadar: DeveloperDiscovery[];
  book: { title: string; author: string; description: string; why: string; url: string };
  oneThing: { title: string; explanation: string; url?: string };
  learning: { topic: string; explanation: string; url?: string };
};
