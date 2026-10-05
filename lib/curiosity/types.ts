export interface HistoryEvent {
  date: string;
  year: number | string;
  title: string;
  explanation: string;
  significance: string;
  url?: string;
}

export interface ReadingItem {
  title: string;
  author: string;
  eraOrCountry?: string;
  format: 'excerpt' | 'poem' | 'passage' | 'fable' | 'essay';
  passage: string;
  whyItMatters: string;
  url?: string;
}

export interface BrainExercise {
  id: string;
  subject: 'mathematics' | 'physics';
  topic: string;
  title: string;
  problem: string;
  givenInfo?: string[];
  hint: string;
  solution: string;
  answer: string;
}

export interface CuriousBriefing {
  date: string;
  history: HistoryEvent;
  reading: ReadingItem;
  exercise: BrainExercise;
}
