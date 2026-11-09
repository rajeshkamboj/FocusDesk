/**
 * The tradition registry and the classification of the authored corpus.
 *
 * WHY A TABLE RATHER THAN A PROPERTY ON EACH ENTRY
 * The 24 characters that existed before this section was renamed were written
 * without a `classification` field, and rewriting them to add one would have meant
 * touching the prose, the ids and the rotation for no reader-visible gain. Their
 * classification is applied here, by id, at the point the array is exported — so the
 * corpus is labelled without being edited.
 *
 * ADDING A TRADITION
 * A new tradition is one entry in `MYTH_TRADITIONS` and a `traditionKey` on the
 * character. Nothing switches on the key; the card prints the label and the filter
 * reads the key, so no code change is needed for a new civilisation.
 */

import type { MythCharacter, MythClassification, MythHistoricity } from './types';

export interface MythTradition {
  key: string;
  label: string;
  /** Where the tradition sits, in the reader's terms. */
  region: string;
  /** `living` — an active religious tradition; `historical` — a past civilisation. */
  status: 'living' | 'historical' | 'mixed';
}

export const MYTH_TRADITIONS: readonly MythTradition[] = [
  { key: 'hindu', label: 'Hindu traditions', region: 'South Asia', status: 'living' },
  { key: 'sikh', label: 'Sikh tradition', region: 'Punjab', status: 'living' },
  { key: 'buddhist', label: 'Buddhist traditions', region: 'South Asia and East Asia', status: 'living' },
  { key: 'jain', label: 'Jain tradition', region: 'South Asia', status: 'living' },
  { key: 'indian', label: 'Indian history', region: 'South Asia', status: 'historical' },
  { key: 'greek', label: 'Ancient Greek', region: 'Mediterranean', status: 'historical' },
  { key: 'roman', label: 'Ancient Roman', region: 'Mediterranean', status: 'historical' },
  { key: 'norse', label: 'Norse', region: 'Scandinavia', status: 'historical' },
  { key: 'egyptian', label: 'Ancient Egyptian', region: 'North Africa', status: 'historical' },
  { key: 'mesopotamian', label: 'Mesopotamian', region: 'West Asia', status: 'historical' },
  { key: 'chinese', label: 'Chinese traditions', region: 'East Asia', status: 'living' },
  { key: 'japanese', label: 'Japanese traditions', region: 'East Asia', status: 'living' },
  { key: 'mesoamerican', label: 'Mesoamerican', region: 'Central America', status: 'historical' },
  { key: 'polynesian', label: 'Polynesian', region: 'Pacific', status: 'living' },
  { key: 'irish', label: 'Irish', region: 'Western Europe', status: 'historical' },
  { key: 'slavic', label: 'Slavic', region: 'Eastern Europe', status: 'historical' },
  { key: 'west-african', label: 'West African', region: 'West Africa', status: 'mixed' },
  { key: 'akan', label: 'Akan', region: 'West Africa', status: 'living' },
  { key: 'yoruba', label: 'Yoruba', region: 'West Africa', status: 'living' },
];

export function traditionLabel(key: string | undefined): string {
  return MYTH_TRADITIONS.find((tradition) => tradition.key === key)?.label ?? 'Tradition';
}

interface Classification {
  classification: MythClassification;
  historicity: MythHistoricity;
  traditionKey: string;
  period: string;
  /** Stated when the classification itself needs a word of explanation. */
  note?: string;
}

/**
 * The classification of the 24 authored characters.
 *
 * The distinctions are the ones the section exists to preserve:
 *
 *  - a deity of a living religion is `religious`, not `mythological` — calling
 *    Ganesha a myth is a claim about someone else's worship that this page does not
 *    make;
 *  - an epic character is `literary`, even when the epic is scripture;
 *  - a figure whose existence is argued by historians is `legendary` with a
 *    `debated` historicity, not a flat assertion either way.
 */
export const MYTH_CLASSIFICATION: Record<string, Classification> = {
  arjuna: {
    classification: 'literary',
    historicity: 'legendary',
    traditionKey: 'hindu',
    period: 'Epic period — the Mahabharata',
    note: 'An epic character within a text that is also scripture; the entry says so rather than choosing one label only.',
  },
  athena: { classification: 'mythological', historicity: 'legendary', traditionKey: 'greek', period: 'Archaic and classical Greece' },
  sita: {
    classification: 'literary',
    historicity: 'legendary',
    traditionKey: 'hindu',
    period: 'Epic period — the Ramayana',
    note: 'Venerated within a living tradition, but known through an epic narrative; the distinction is stated, not hidden.',
  },
  anansi: { classification: 'mythological', historicity: 'legendary', traditionKey: 'akan', period: 'Oral tradition, pre-colonial to present' },
  hanuman: {
    classification: 'religious',
    historicity: 'legendary',
    traditionKey: 'hindu',
    period: 'Epic period and later devotional tradition',
    note: 'An object of living devotion; the account of his deeds is the epic’s, not a historical record.',
  },
  loki: { classification: 'mythological', historicity: 'legendary', traditionKey: 'norse', period: 'Viking Age and earlier' },
  ganesha: {
    classification: 'religious',
    historicity: 'legendary',
    traditionKey: 'hindu',
    period: 'Puranic period onward',
    note: 'A deity of a living religion. “Mythological” is used here only for figures no community worships.',
  },
  enkidu: { classification: 'literary', historicity: 'legendary', traditionKey: 'mesopotamian', period: 'Bronze Age Mesopotamian literature' },
  ravana: { classification: 'literary', historicity: 'legendary', traditionKey: 'hindu', period: 'Epic period — the Ramayana' },
  amaterasu: {
    classification: 'religious',
    historicity: 'legendary',
    traditionKey: 'japanese',
    period: 'Recorded in the Kojiki and Nihon Shoki, 8th century CE',
  },
  yama: { classification: 'religious', historicity: 'legendary', traditionKey: 'hindu', period: 'Vedic period and later' },
  isis: { classification: 'religious', historicity: 'legendary', traditionKey: 'egyptian', period: 'Pharaonic Egypt' },
  gilgamesh: {
    classification: 'legendary',
    historicity: 'debated',
    traditionKey: 'mesopotamian',
    period: 'Bronze Age; possibly a real king of Uruk c. 2700 BCE',
    note: 'The poems are literature; whether a king of that name ruled Uruk is a separate and disputed question.',
  },
  inanna: { classification: 'religious', historicity: 'legendary', traditionKey: 'mesopotamian', period: 'Sumerian and Akkadian periods' },
  odin: { classification: 'mythological', historicity: 'legendary', traditionKey: 'norse', period: 'Viking Age; recorded in the Eddas, 13th century CE' },
  persephone: { classification: 'mythological', historicity: 'legendary', traditionKey: 'greek', period: 'Archaic and classical Greece' },
  heracles: { classification: 'mythological', historicity: 'legendary', traditionKey: 'greek', period: 'Archaic and classical Greece' },
  quetzalcoatl: {
    classification: 'legendary',
    historicity: 'debated',
    traditionKey: 'mesoamerican',
    period: 'Classic and post-classic Mesoamerica',
    note: 'A deity and, in some later sources, a legendary ruler-priest; the two are not the same figure and the entry keeps them apart.',
  },
  maui: { classification: 'mythological', historicity: 'legendary', traditionKey: 'polynesian', period: 'Polynesian oral tradition' },
  'sun-wukong': { classification: 'literary', historicity: 'legendary', traditionKey: 'chinese', period: 'Ming dynasty — Journey to the West' },
  change: { classification: 'mythological', historicity: 'legendary', traditionKey: 'chinese', period: 'Classical Chinese myth' },
  'cu-chulainn': { classification: 'legendary', historicity: 'legendary', traditionKey: 'irish', period: 'Ulster Cycle; Iron Age setting, medieval recording' },
  'baba-yaga': { classification: 'mythological', historicity: 'legendary', traditionKey: 'slavic', period: 'Slavic folklore' },
  oshun: { classification: 'religious', historicity: 'legendary', traditionKey: 'yoruba', period: 'Yoruba tradition, pre-colonial to present' },
};

/** Apply a classification without overwriting anything the entry already states. */
export function withClassification(character: MythCharacter): MythCharacter {
  const found = MYTH_CLASSIFICATION[character.id];
  if (!found) return character;
  return {
    ...character,
    classification: character.classification ?? found.classification,
    historicity: character.historicity ?? found.historicity,
    traditionKey: character.traditionKey ?? found.traditionKey,
    ...(character.period ? {} : { period: found.period }),
    ...(character.contestedNote || !found.note ? {} : { contestedNote: found.note }),
  };
}

/** The label printed on the card for a classification. */
export function classificationOf(character: MythCharacter): MythClassification {
  return character.classification ?? MYTH_CLASSIFICATION[character.id]?.classification ?? 'mythological';
}
