/*
 * The shared parts of the redesigned pages. One language with the phone:
 * word tabs between a screen's pages, dark chips to narrow a list, a date
 * tile on every dated row, one card, one section title, one filled action.
 */
export { CARD, SectionTitle } from '@/components/home/parts';
export { PageTabs, type PageTab } from './page-tabs';
export { DateTile, TimeTile, dateTileParts } from './date-tile';
export { FilterChip } from './filter-chip';
export { Pill, StatusDot } from './pill';
export {
  FORM_INPUT,
  FORM_TEXTAREA,
  FORM_SUBMIT,
  FormField,
  ChoiceChip,
  FormSection,
  FormCard,
  FormRow,
  FormSwitchRow,
  FormNotice,
  FormFooter,
} from './form';
export { Panel, Kbd, HintBar } from './desktop';
