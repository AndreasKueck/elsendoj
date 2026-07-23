const SOURCE_URL = 'http://www.eibispace.de/dx/bc-a26.txt';

// Altigi kashmemoran version, kia, la filtra logiko shanghighas
const CACHE_VERSION = 'v6';

const LANGUAGES = [
  { code: 'EO', label: 'Esperanto' },
  { code: 'E',  label: 'angla' },
  { code: 'F',  label: 'franca' },
  { code: 'D',  label: 'germana' },
  { code: 'S',  label: 'hispana' },  
  { code: 'I',  label: 'itala' },  
  { code: 'P',  label: 'portugala' },
  { code: 'RO', label: 'rumana' },
  { code: 'R',  label: 'rusa' },
  { code: 'UK', label: 'ukraina' }
];

/*
  Tipaj celregion-kodoj en EiBi-listo.

  Tiu chi listo malhelpas, ke lingvokodo, kiel ekz. "I" mise
  estas komprenata, kiel landokodo por Italujo.
*/
const TARGET_AREAS = [
  // Afriko
  'Af', 'NAf', 'EAf', 'WAf', 'SAf', 'CAf',

  // Europo
  'Eu', 'WEu', 'EEu', 'NEu', 'SEu', 'CEu', 'SEE',

  // Azio
  'As', 'EAs', 'WAs', 'SAs', 'SEAs', 'CAs', 'SEA', 'FE', 'BGD', 'NIn', 'SIn', 'PAK', 'NPL',

  // Ameriko
  'Am', 'NAm', 'CAm', 'SAm', 'LAm', 'Car', 'ENA', 'CNA', 'WNA',

  // Oceanio/Pacifiko
  'Oc', 'WOc', 'EOc', 'Pac',

  // Pliaj oftaj celregion-indikoj
  'ME', 'FE', 'CIS', 'Sib', 'Cau', 'Tib', 'Dom', 'Int', 'Wld', 'WIO', 'WNA', 'SAO', 'NAO', 'Glo', 'In'
];

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('Radioelsendoj en amplitudmodulado');
}

function getBroadcasts(langCode) {
  const language = getLanguageByCode_(langCode);

  const cache = CacheService.getScriptCache();
  const cacheKey = CACHE_VERSION + '_broadcasts_' + language.code;

  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const sourceText = fetchSourceText_();
  const filteredText = filterBroadcastsByLanguage_(sourceText, language.code);

  const result = {
    code: language.code,
    label: language.label,
    text: filteredText || 'Neniu elsendo trovita por la elektita lingvo.',
    count: countBroadcasts_(filteredText)
  };

  cache.put(cacheKey, JSON.stringify(result), 600);

  return result;
}

function getLanguageByCode_(langCode) {
  const normalizedCode = normalizeLanguageCode_(langCode);

  const knownLanguage = LANGUAGES.find(function (language) {
    return language.code === normalizedCode;
  });

  if (knownLanguage) {
    return knownLanguage;
  }

  return {
    code: normalizedCode || 'EO',
    label: normalizedCode ? 'alia lingvo: ' + normalizedCode : 'Esperanto'
  };
}

/**
 * EiBi-lingvokodoj povas konsisti el unu ghis tri literoj, ekzemple:
 * D, EO, RO, UK, HI, MAR.
 */
function normalizeLanguageCode_(langCode) {
  return String(langCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
}

function fetchSourceText_() {
  const response = UrlFetchApp.fetch(SOURCE_URL, {
    muteHttpExceptions: true,
    followRedirects: true
  });

  const status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error('La fonta dosiero ne povis esti shargita. HTTP-statuso: ' + status);
  }

  const blob = response.getBlob();

  let text = blob.getDataAsString('UTF-8');

  if (text.indexOf('\uFFFD') !== -1) {
    text = blob.getDataAsString('ISO-8859-1');
  }

  return text;
}

/**
 * Filtrado de chiuj blokoj, kies starta linio komencighas per horo
 * kaj entenas la elektitan lingvokodon.
 *
 * Bloko komencighas per linio kun /^[0-9]{4}/.
 * Se la elektitan lingvokodon entenas linio, tiu chi kaj
 * chiuj sekvaj ne-startlinioj estas eligataj.
 */
function filterBroadcastsByLanguage_(sourceText, langCode) {
  const lines = sourceText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n');

  const startLineRegex = /^[0-9]{4}/;
  const languageRegex = buildLanguageRegex_(langCode);

  const output = [];
  let inBlock = false;

  lines.forEach(function (line) {
    if (startLineRegex.test(line)) {
      if (languageRegex.test(line)) {
        output.push(line);
        inBlock = true;
      } else {
        inBlock = false;
      }

      return;
    }

    if (inBlock) {
      output.push(line);
    }
  });

  return output.join('\n').trim();
}

function buildLanguageRegex_(langCode) {
  /*
    Serchataj estas:

      lingvokod + celregionkodo + frekvenco

    Ekzemploj:
      HI  NPL 15410b
      EO  Eu  12345
      I   Eu  12345
      MAR SAs 12345

    La celregionkodo povas esti ekz.:
      Eu, WEu, SAs, NPL, IND, AFG

    La frekvenco komencighas per tri ghis kvin ciferoj kaj poste povas ankorau enteni
    literojn au specialajn signojn, ekz. 15410b.
  */

  return new RegExp(
    '(?:^|\\s)' +
    escapeRegExp_(langCode) +
    '\\s+' +
    '[A-Za-z]{2,5}(?:/[A-Za-z]{2,5})*' +
    '\\s+' +
    '[0-9]{3,5}[A-Za-z0-9.,/-]*' +
    '(?=\\s|$)'
  );
}

function countBroadcasts_(text) {
  if (!text) {
    return 0;
  }

  return text
    .split('\n')
    .filter(function (line) {
      return /^[0-9]{4}/.test(line);
    })
    .length;
}

function escapeRegExp_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
