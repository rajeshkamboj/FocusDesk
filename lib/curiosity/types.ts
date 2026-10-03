export type CuriosityNewsItem = {
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
};

export type CuriosityVideo = {
  title: string;
  source: string;
  thumbnail?: string;
  why: string;
  url: string;
};

export type DeveloperDiscovery = {
  name: string;
  description: string;
  why: string;
  pricing: string;
  url: string;
};

export type GurbaniItem = {
  text: string;
  ang: string;
  translation: string;
  explanation: string;
  source: string;
  url: string;
};

export type CuriosityBriefing = {
  date: string;
  gurbani: GurbaniItem | null;
  aiWorld: CuriosityNewsItem[];
  videos: CuriosityVideo[];
  developerRadar: DeveloperDiscovery[];
  book: { title: string; author: string; description: string; why: string; url: string };
  learning: { topic: string; explanation: string; url?: string };
};
