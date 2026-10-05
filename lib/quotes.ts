import type { ISODate } from './types';
import { todayISO } from './dates';

export interface Quote {
  text: string;
  author: string;
}

export const DAILY_QUOTES: Quote[] = [
  {
    text: 'Great things are done by a series of small things brought together.',
    author: 'Vincent van Gogh',
  },
  {
    text: 'Learning never exhausts the mind.',
    author: 'Leonardo da Vinci',
  },
  {
    text: 'The impediment to action advances action. What stands in the way becomes the way.',
    author: 'Marcus Aurelius',
  },
  {
    text: 'It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.',
    author: 'Seneca',
  },
  {
    text: 'The journey of a thousand miles begins with a single step.',
    author: 'Lao Tzu',
  },
  {
    text: 'It does not matter how slowly you go as long as you do not stop.',
    author: 'Confucius',
  },
  {
    text: 'Adopt the pace of nature: her secret is patience.',
    author: 'Ralph Waldo Emerson',
  },
  {
    text: 'Great works are performed not by strength, but by perseverance.',
    author: 'Samuel Johnson',
  },
  {
    text: 'Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.',
    author: 'Antoine de Saint-Exupéry',
  },
  {
    text: 'It is not enough to be busy; so are the ants. The question is: what are we busy about?',
    author: 'Henry David Thoreau',
  },
  {
    text: "I would rather have questions that can't be answered than answers that can't be questioned.",
    author: 'Richard Feynman',
  },
  {
    text: 'An investment in knowledge pays the best interest.',
    author: 'Benjamin Franklin',
  },
  {
    text: 'How we spend our days is, of course, how we spend our lives.',
    author: 'Annie Dillard',
  },
  {
    text: 'Quality is never an accident; it is always the result of intelligent effort.',
    author: 'John Ruskin',
  },
  {
    text: 'Somewhere, something incredible is waiting to be known.',
    author: 'Carl Sagan',
  },
  {
    text: 'You cannot cross the sea merely by standing and staring at the water.',
    author: 'Rabindranath Tagore',
  },
  {
    text: 'I have no special talents. I am only passionately curious.',
    author: 'Albert Einstein',
  },
  {
    text: 'Confine yourself to the present.',
    author: 'Marcus Aurelius',
  },
  {
    text: 'Do not seek to follow in the footsteps of the wise; seek what they sought.',
    author: 'Matsuo Basho',
  },
  {
    text: "Don't judge each day by the harvest you reap but by the seeds that you plant.",
    author: 'Robert Louis Stevenson',
  },
  {
    text: 'A writer who waits for ideal conditions under which to work will die without putting a word on paper.',
    author: 'E. B. White',
  },
  {
    text: 'When you improve a little each day, eventually big things occur.',
    author: 'John Wooden',
  },
  {
    text: 'The great thing in this world is not so much where we stand, as in what direction we are moving.',
    author: 'Oliver Wendell Holmes Sr.',
  },
  {
    text: 'Begin what you want to do now. We are not living in eternity. We have only this moment.',
    author: 'Francis Bacon',
  },
  {
    text: 'When you do the common things in life in an uncommon way, you will command the attention of the world.',
    author: 'George Washington Carver',
  },
  {
    text: 'Start where you are. Use what you have. Do what you can.',
    author: 'Arthur Ashe',
  },
  {
    text: 'What you do makes a difference, and you have to decide what kind of difference you want to make.',
    author: 'Jane Goodall',
  },
  {
    text: 'The man who moves a mountain begins by carrying away small stones.',
    author: 'Confucius',
  },
  {
    text: 'Be patient toward all that is unsolved in your heart and try to love the questions themselves.',
    author: 'Rainer Maria Rilke',
  },
  {
    text: 'Perseverance, secret of all triumphs.',
    author: 'Victor Hugo',
  },
  {
    text: 'Nothing in life is to be feared, it is only to be understood. Now is the time to understand more, so that we may fear less.',
    author: 'Marie Curie',
  },
  {
    text: 'First say to yourself what you would be; and then do what you have to do.',
    author: 'Epictetus',
  },
  {
    text: 'Instructions for living a life: Pay attention. Be astonished. Tell about it.',
    author: 'Mary Oliver',
  },
  {
    text: 'Every artist was first an amateur.',
    author: 'Ralph Waldo Emerson',
  },
  {
    text: 'Knowing is not enough; we must apply. Willing is not enough; we must do.',
    author: 'Johann Wolfgang von Goethe',
  },
  {
    text: 'The greatest thing in the world is to know how to belong to oneself.',
    author: 'Michel de Montaigne',
  },
  {
    text: "You can't use up creativity. The more you use, the more you have.",
    author: 'Maya Angelou',
  },
  {
    text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
    author: 'Will Durant',
  },
  {
    text: 'Details make perfection, and perfection is not a detail.',
    author: 'Leonardo da Vinci',
  },
  {
    text: 'Luck is what happens when preparation meets opportunity.',
    author: 'Seneca',
  },
  {
    text: 'The reward of one duty is the power to fulfill another.',
    author: 'George Eliot',
  },
  {
    text: 'Action seems to follow feeling, but really action and feeling go together.',
    author: 'William James',
  },
  {
    text: 'Character cannot be developed in ease and quiet. Only through experience of trial and suffering can the soul be strengthened.',
    author: 'Helen Keller',
  },
  {
    text: 'It is not the strongest of the species that survive, nor the most intelligent, but the one most responsive to change.',
    author: 'Charles Darwin',
  },
  {
    text: 'Creativity takes courage.',
    author: 'Henri Matisse',
  },
  {
    text: 'Education is not the filling of a pail, but the lighting of a fire.',
    author: 'W. B. Yeats',
  },
  {
    text: 'Genius is one percent inspiration and ninety-nine percent perspiration.',
    author: 'Thomas Edison',
  },
  {
    text: "Even if you're on the right track, you'll get run over if you just sit there.",
    author: 'Will Rogers',
  },
  {
    text: 'No great thing is created suddenly, any more than a bunch of grapes or a fig.',
    author: 'Epictetus',
  },
  {
    text: 'Waste no more time arguing about what a good man should be. Be one.',
    author: 'Marcus Aurelius',
  },
];

/**
 * Deterministically select a quote for a calendar date (YYYY-MM-DD).
 *
 * Consecutive days will show distinct quotes, and the selection is
 * pure, deterministic, and works fully offline.
 */
export function getDailyQuote(date: ISODate = todayISO()): Quote {
  const [year, month, day] = date.split('-').map(Number);
  const epochDays = Math.floor(Date.UTC(year, (month || 1) - 1, day || 1) / 86_400_000);
  const index = ((epochDays % DAILY_QUOTES.length) + DAILY_QUOTES.length) % DAILY_QUOTES.length;
  return DAILY_QUOTES[index];
}
