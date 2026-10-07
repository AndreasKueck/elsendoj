// ============================================================
// Muzikaj elsendoj el la PDF-listo de Alan Roe
// ============================================================

const MZK_ORIGINAL_SOURCE_URL =
  'https://app.box.com/s/kbdxb4c5lwpju0kpoi27aiwc35br2g2a/file/2466236594020';

const MZK_SOURCE_CREDIT =
  'Alan Roe — A Selection of Music Programmes on Shortwave';

const MZK_MAX_PDF_BYTES = 15 * 1024 * 1024;

/**
 * Liest die Datei-ID aus den Skripteigenschaften.
 *
 * Eigenschaft:
 * MZK_PDF_FILE_ID
 *
 * Der Wert muss ausschließlich die Drive-Datei-ID enthalten,
 * nicht den vollständigen Freigabelink.
 */
function getMusicPdfFileId_() {
  const fileId = (
    PropertiesService
      .getScriptProperties()
      .getProperty('MZK_PDF_FILE_ID') || ''
  ).trim();

  if (!fileId) {
    throw new Error(
      'La administranto ankorau ne agordis la ' +
      'skriptoproprajhon MZK_PDF_FILE_ID.'
    );
  }

  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    throw new Error(
      'La skriptoproprajho MZK_PDF_FILE_ID havas ' +
      'nevalidan valoron. Enmetu nur la dosieran ID, ' +
      'ne la tutan Google-Drive-ligilon.'
    );
  }

  return fileId;
}

/**
 * Liefert ausschließlich die in den Skripteigenschaften
 * konfigurierte Musik-PDF.
 *
 * Zuerst Zugriff über DriveApp.
 * Bei einem Zugriffsfehler anschließend öffentlicher Download.
 *
 * Die tatsächlichen technischen Fehler werden nur im
 * Ausführungsprotokoll festgehalten, nicht an Besucher gesendet.
 */
function getMusicPdf() {
  const fileId = getMusicPdfFileId_();

  let blob = null;
  let updatedAt = '';
  let driveAccessFailed = false;

  // ----------------------------------------------------------
  // 1. Zugriff über das ausführende Google-Konto
  // ----------------------------------------------------------

  try {
    const file = DriveApp.getFileById(fileId);

    updatedAt = file.getLastUpdated().toISOString();
    blob = file.getBlob();
  } catch (error) {
    driveAccessFailed = true;

    console.warn(
      'MZK — Zugriff über DriveApp fehlgeschlagen:\n' +
      mzkErrorDetails_(error)
    );
  }

  // ----------------------------------------------------------
  // 2. Ersatzweg: Download der öffentlich freigegebenen Datei
  // ----------------------------------------------------------

  if (driveAccessFailed) {
    const downloadUrl =
      'https://drive.google.com/uc?export=download&id=' +
      encodeURIComponent(fileId);

    let response;

    try {
      response = UrlFetchApp.fetch(downloadUrl, {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true
      });
    } catch (error) {
      console.error(
        'MZK — Öffentlicher Download fehlgeschlagen:\n' +
        mzkErrorDetails_(error)
      );

      throw new Error(
        'La muzika PDF-dosiero ne povis esti shargita. ' +
        'Ankau la publika elshuto el Google Drive malsukcesis. ' +
        'La administranto kontrolu la plenumprotokolon.'
      );
    }

    const status = response.getResponseCode();

    if (status < 200 || status >= 300) {
      console.error(
        'MZK — Öffentlicher Download: HTTP ' + status
      );

      throw new Error(
        'La publika elshuto de la muzika PDF malsukcesis. ' +
        'HTTP-statuso: ' + status + '. ' +
        'La administranto kontrolu la dosierpermesojn ' +
        'kaj la plenumprotokolon.'
      );
    }

    blob = response.getBlob();

    // Über diesen Ersatzweg ist kein verlässlicher
    // Änderungszeitpunkt der Drive-Datei verfügbar.
    updatedAt = '';
  }

  // ----------------------------------------------------------
  // 3. Inhalt prüfen
  // ----------------------------------------------------------

  if (!blob) {
    throw new Error(
      'La muzika fonto ne liveris dosieron.'
    );
  }

  const bytes = blob.getBytes();

  if (bytes.length > MZK_MAX_PDF_BYTES) {
    throw new Error(
      'La muzika PDF-dosiero estas tro granda por tiu chi sercho.'
    );
  }

  const signature = bytes
    .slice(0, 5)
    .map(function (value) {
      return String.fromCharCode((value + 256) % 256);
    })
    .join('');

  if (signature !== '%PDF-') {
    console.error(
      'MZK — Die Antwort ist keine PDF. ' +
      'Zugriffsweg: ' +
      (driveAccessFailed ? 'öffentlicher Download' : 'DriveApp') +
      '; Inhaltstyp: ' + blob.getContentType() +
      '; Bytes: ' + bytes.length
    );

    throw new Error(
      'Google Drive ne liveris PDF-dosieron. ' +
      'Eble ghi liveris ensalutan au konfirman paghon. ' +
      'La administranto kontrolu, chu la originala PDF ' +
      'estas elshutebla sen ensaluto.'
    );
  }

  console.info(
    'MZK — PDF erfolgreich geladen. ' +
    'Zugriffsweg: ' +
    (driveAccessFailed ? 'öffentlicher Download' : 'DriveApp') +
    '; Bytes: ' + bytes.length
  );

  return {
    base64: Utilities.base64Encode(bytes),
    updatedAt: updatedAt,
    sourceUrl: MZK_ORIGINAL_SOURCE_URL,
    credit: MZK_SOURCE_CREDIT
  };
}

/**
 * Technische Fehlerdetails ausschließlich für das
 * Ausführungsprotokoll.
 */
function mzkErrorDetails_(error) {
  if (!error) {
    return 'Unbekannter Fehler';
  }

  return error.stack
    ? String(error.stack)
    : String(error.message || error);
}
