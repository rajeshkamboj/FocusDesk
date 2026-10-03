import type { CuriosityBriefing } from './types';

const books = [
  { title: 'The Design of Everyday Things', author: 'Don Norman', description: 'A practical look at why some products feel obvious and others feel frustrating.', why: 'Useful for building calmer, more understandable interfaces.', url: 'https://jnd.org/books/the-design-of-everyday-things-revised-and-expanded/' },
  { title: 'The Information', author: 'James Gleick', description: 'A history of ideas about information, from language and code to the digital age.', why: 'A thoughtful bridge between science, communication, and computing.', url: 'https://www.jamesgleick.com/the-information/' },
  { title: 'Range', author: 'David Epstein', description: 'Why broad experience can be an advantage in a world that rewards specialization.', why: 'Encouragement for a developer, teacher, and learner with many connected interests.', url: 'https://davidepstein.com/the-range/' },
];

const lessons = [
  { topic: 'The bicycle principle of gradient descent', explanation: 'Imagine standing on a foggy hillside and wanting to reach the lowest point. You can feel the slope beneath your feet, take a small step downhill, and repeat. Gradient descent does the same with a model: the gradient says which direction increases error, and a learning rate controls the step size. Small steps are slower but safer; very large steps can overshoot the valley.', url: 'https://developers.google.com/machine-learning/crash-course/linear-regression/gradient-descent' },
  { topic: 'Why web browsers use the event loop', explanation: 'JavaScript can run one piece of code at a time, but a browser still needs to wait for network and timer work without freezing the page. The event loop places completed callbacks in a queue and runs them when the current stack is clear. That is why an async function can pause for I/O while the interface remains responsive.', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model' },
  { topic: 'Bayes’ theorem as an update rule', explanation: 'Bayes’ theorem is a disciplined way to update a belief after seeing evidence. Start with a prior belief, measure how likely the evidence is under competing explanations, then normalize. It is less about complicated arithmetic than about making assumptions visible and revisable.', url: 'https://plato.stanford.edu/entries/bayes-theorem/' },
];

export function dailyEditorial(date: string): Pick<CuriosityBriefing, 'book' | 'learning'> {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return { book: books[day % books.length], learning: lessons[day % lessons.length] };
}
