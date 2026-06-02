const CP1252_BYTES: Record<string, number> = {
  '\u20ac': 0x80,
  '\u201a': 0x82,
  '\u0192': 0x83,
  '\u201e': 0x84,
  '\u2026': 0x85,
  '\u2020': 0x86,
  '\u2021': 0x87,
  '\u02c6': 0x88,
  '\u2030': 0x89,
  '\u0160': 0x8a,
  '\u2039': 0x8b,
  '\u0152': 0x8c,
  '\u017d': 0x8e,
  '\u2018': 0x91,
  '\u2019': 0x92,
  '\u201c': 0x93,
  '\u201d': 0x94,
  '\u2022': 0x95,
  '\u2013': 0x96,
  '\u2014': 0x97,
  '\u02dc': 0x98,
  '\u2122': 0x99,
  '\u0161': 0x9a,
  '\u203a': 0x9b,
  '\u0153': 0x9c,
  '\u017e': 0x9e,
  '\u0178': 0x9f,
};

const BAD_CP1252_AFTER_E_ACUTE = /\u00e2[\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/;
const BAD_TEXT_RE = /\u00c3\u0192|\u00c3\u201a|\u00c3\u201e|\u00c3\u2020|\u00c3\u00a1\u00c2\u00ba|\u00c3\u00a1\u00c2\u00bb|\u00c3\u00a1[\u00ba\u00bb]|\u00c3\u00a2\u00e2\u201a\u00ac|\u00c3\u00b0\u00c5\u00b8|\u00e1[\u00ba\u00bb]|\u00c3|\u00c2|\u00c4|\u00c6|\u00c5|\u00f0\u0178|\uFFFD|[\u0080-\u009f]/;
const BAD_TEXT_RE_GLOBAL = /\u00c3\u0192|\u00c3\u201a|\u00c3\u201e|\u00c3\u2020|\u00c3\u00a1\u00c2\u00ba|\u00c3\u00a1\u00c2\u00bb|\u00c3\u00a1[\u00ba\u00bb]|\u00c3\u00a2\u00e2\u201a\u00ac|\u00c3\u00b0\u00c5\u00b8|\u00e1[\u00ba\u00bb]|\u00c3|\u00c2|\u00c4|\u00c6|\u00c5|\u00f0\u0178|\uFFFD|[\u0080-\u009f]/g;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });
const VIETNAMESE_CHARS = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ';

const knownVietnameseMojibake = (() => {
  const entries: Array<[string, string]> = [];
  const latin1FromUtf8 = (value: string) => String.fromCharCode(...encoder.encode(value));
  for (const char of VIETNAMESE_CHARS) {
    const once = latin1FromUtf8(char);
    const twice = latin1FromUtf8(once);
    entries.push([twice, char]);
    entries.push([twice.replace(/Â/g, ''), char]);
    entries.push([once, char]);
  }
  entries.push(['\u00c4\u2018', 'đ']);
  entries.push(['\u00c4\u0090', 'Đ']);
  return entries.sort((a, b) => b[0].length - a[0].length);
})();

function repairKnownVietnameseMojibake(value: string) {
  let repaired = value;
  for (const [bad, good] of knownVietnameseMojibake) {
    if (bad && repaired.includes(bad)) repaired = repaired.split(bad).join(good);
  }
  return repaired;
}

function badScore(value: string) {
  const matches = (value.match(BAD_TEXT_RE_GLOBAL)?.length ?? 0) + (BAD_CP1252_AFTER_E_ACUTE.test(value) ? 1 : 0);
  const replacementChars = (value.match(/\uFFFD/g)?.length ?? 0) * 4;
  return matches + replacementChars;
}

function utf8BytesForCodePoint(codePoint: number) {
  return Array.from(encoder.encode(String.fromCodePoint(codePoint)));
}

function reinterpretCp1252AsUtf8(value: string) {
  const bytes: number[] = [];
  for (const char of value) {
    const cp1252 = CP1252_BYTES[char];
    if (typeof cp1252 === 'number') {
      bytes.push(cp1252);
      continue;
    }

    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    bytes.push(...utf8BytesForCodePoint(codePoint));
  }
  return decoder.decode(new Uint8Array(bytes));
}

export function repairMojibakeText(value: string) {
  if (!BAD_TEXT_RE.test(value) && !BAD_CP1252_AFTER_E_ACUTE.test(value)) return value;

  let current = repairKnownVietnameseMojibake(value);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    current = repairKnownVietnameseMojibake(current);
    if (!BAD_TEXT_RE.test(current) && !BAD_CP1252_AFTER_E_ACUTE.test(current)) return current;

    const beforeScore = badScore(current);
    const beforeReplacementCount = current.match(/\uFFFD/g)?.length ?? 0;
    const repaired = reinterpretCp1252AsUtf8(current);
    const afterScore = badScore(repaired);
    const afterReplacementCount = repaired.match(/\uFFFD/g)?.length ?? 0;

    if (afterScore < beforeScore && afterReplacementCount <= beforeReplacementCount) {
      current = repaired;
      continue;
    }

    const tokenRepaired = current.replace(/[^ \t\r\n]+/g, token => {
      if (!BAD_TEXT_RE.test(token) && !BAD_CP1252_AFTER_E_ACUTE.test(token)) return token;
      const tokenBeforeScore = badScore(token);
      const tokenBeforeReplacementCount = token.match(/\uFFFD/g)?.length ?? 0;
      const repairedToken = reinterpretCp1252AsUtf8(token);
      const tokenAfterScore = badScore(repairedToken);
      const tokenAfterReplacementCount = repairedToken.match(/\uFFFD/g)?.length ?? 0;
      return tokenAfterScore < tokenBeforeScore && tokenAfterReplacementCount <= tokenBeforeReplacementCount
        ? repairedToken
        : token;
    });

    if (badScore(tokenRepaired) < beforeScore) {
      current = tokenRepaired;
      continue;
    }
    return current;
  }
  return current;
}

export function repairMojibakeDeep<T>(value: T): T {
  if (typeof value === 'string') return repairMojibakeText(value) as T;
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => repairMojibakeDeep(item)) as T;

  const source = value as Record<string, unknown>;
  const repaired: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    repaired[key] = repairMojibakeDeep(item);
  }
  return repaired as T;
}

export function hasMojibakeText(value: unknown): boolean {
  if (typeof value === 'string') {
    return BAD_TEXT_RE.test(value) || BAD_CP1252_AFTER_E_ACUTE.test(value);
  }
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => hasMojibakeText(item));
  return Object.values(value as Record<string, unknown>).some(item => hasMojibakeText(item));
}
