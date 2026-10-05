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

export interface HistoryEvent {
  date: string;
  year: number | string;
  title: string;
  explanation: string;
  significance: string;
  url?: string;
}

export interface LiteratureItem {
  title: string;
  author: string;
  eraOrCountry?: string;
  format?: 'excerpt' | 'poem' | 'passage' | 'fable' | 'essay';
  passage: string;
  whyItMatters: string;
  url?: string;
}

export interface BrainSharpener {
  id: string;
  subject: 'mathematics' | 'physics';
  topic: string;
  title: string;
  problem: string;
  givenInfo?: string[];
  hint?: string;
  solution: string;
  answer: string;
}

export type CuriosityBriefing = {
  date: string;
  aiWorld: CuriosityNewsItem[];
  developerRadar: DeveloperDiscovery[];
  book: { title: string; author: string; description: string; why: string; url: string };
  oneThing: { title: string; explanation: string; url?: string };
  learning: { topic: string; explanation: string; url?: string };
  history: HistoryEvent;
  literature: LiteratureItem;
  sharpener: BrainSharpener;
};
