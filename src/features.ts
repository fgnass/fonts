// What the OpenType features of a font do, for the specimen: a name, a text
// that shows the feature, and whether browsers apply it by default (so that
// the specimen knows which side of the comparison is the plain text).

export interface FeatureInfo {
  name: string;
  /** Text that shows the feature; none for features that work behind the scenes (positioning of marks, required substitutions). */
  sample?: string;
  /** Browsers apply the feature unless it is turned off. */
  default?: boolean;
}

const FIGURES = '0123456789';

const FEATURES: Record<string, FeatureInfo> = {
  liga: { name: 'Standard ligatures', sample: 'fi fl ff ffi ffl', default: true },
  clig: { name: 'Contextual ligatures', sample: 'fi fl ft', default: true },
  dlig: { name: 'Discretionary ligatures', sample: 'st ct sp Th' },
  hlig: { name: 'Historical ligatures', sample: 'st ct' },
  rlig: { name: 'Required ligatures', default: true },
  calt: { name: 'Contextual alternates', sample: 'a -> b => c != d', default: true },
  kern: { name: 'Kerning', sample: 'AVATAR To Ya LT', default: true },
  smcp: { name: 'Small capitals', sample: 'Small Capitals' },
  c2sc: { name: 'Capitals to small capitals', sample: 'SMALL CAPITALS' },
  pcap: { name: 'Petite capitals', sample: 'Petite Capitals' },
  c2pc: { name: 'Capitals to petite capitals', sample: 'PETITE CAPITALS' },
  unic: { name: 'Unicase', sample: 'Unicase Letters' },
  case: { name: 'Case-sensitive forms', sample: '(H) [A] {B} @H -H-' },
  cpsp: { name: 'Capital spacing', sample: 'CAPITAL SPACING' },
  titl: { name: 'Titling alternates', sample: 'TITLING' },
  onum: { name: 'Oldstyle figures', sample: FIGURES },
  lnum: { name: 'Lining figures', sample: FIGURES },
  pnum: { name: 'Proportional figures', sample: '1111 0000' },
  tnum: { name: 'Tabular figures', sample: '1111 0000' },
  zero: { name: 'Slashed zero', sample: '0 100 2000' },
  frac: { name: 'Fractions', sample: '1/2 3/4 7/8' },
  afrc: { name: 'Alternative fractions', sample: '1/2 3/4' },
  ordn: { name: 'Ordinals', sample: '1st 2nd 3rd 1a 2o' },
  sups: { name: 'Superscripts', sample: 'x2 1st 2nd' },
  subs: { name: 'Subscripts', sample: 'H2O CO2' },
  sinf: { name: 'Scientific inferiors', sample: 'H2O CO2' },
  numr: { name: 'Numerators', sample: '12 34' },
  dnom: { name: 'Denominators', sample: '12 34' },
  swsh: { name: 'Swashes', sample: 'Aa Qq Rr Kk' },
  cswh: { name: 'Contextual swashes', sample: 'Aa Qq Rr Kk' },
  salt: { name: 'Stylistic alternates', sample: 'a g y Q R & @' },
  hist: { name: 'Historical forms', sample: 'Historical forms' },
  ital: { name: 'Italics', sample: 'Italic forms' },
  nalt: { name: 'Alternate annotation forms', sample: '1 2 3 A B C' },
  ornm: { name: 'Ornaments', sample: 'a b c d e' },
  locl: { name: 'Localized forms', default: true },
  ccmp: { name: 'Glyph composition', default: true },
  mark: { name: 'Mark positioning', default: true },
  mkmk: { name: 'Mark to mark positioning', default: true },
  rvrn: { name: 'Required variation alternates', default: true },
  rclt: { name: 'Required contextual alternates', default: true },
  curs: { name: 'Cursive positioning', default: true },
  dist: { name: 'Distances', default: true },
  aalt: { name: 'Access all alternates' },
  size: { name: 'Optical size' },
  abvm: { name: 'Above-base mark positioning', default: true },
  blwm: { name: 'Below-base mark positioning', default: true },
  init: { name: 'Initial forms', default: true },
  medi: { name: 'Medial forms', default: true },
  fina: { name: 'Final forms', default: true },
  isol: { name: 'Isolated forms', default: true },
};

/** The sample of a stylistic set or character variant: letters and figures that designers often give alternates. */
const SET_SAMPLE = 'Aa Gg Qq Rr Yy & @ 0 1 7';

/** What a feature tag means; stylistic sets and character variants by their number, unknown tags by the tag alone. */
export function featureInfo(tag: string): FeatureInfo {
  const set = tag.match(/^ss(\d\d)$/), cv = tag.match(/^cv(\d\d)$/);
  if (set) return { name: `Stylistic set ${+set[1]}`, sample: SET_SAMPLE };
  if (cv) return { name: `Character variant ${+cv[1]}`, sample: SET_SAMPLE };
  return FEATURES[tag] ?? { name: tag };
}
