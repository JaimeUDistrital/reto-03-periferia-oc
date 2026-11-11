/** Escritura de la evidencia: out/<caso>/aprobacion.txt (P0) y aprobacion.pdf (P1, pdf-lib). */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { shaEvidencia, textoEvidencia } from "../domain/evidencia";
import type { Aprobacion } from "../domain/tipos";

export interface EvidenciaGenerada {
  ruta: string;
  sha256: string;
  pdf: string;
}

const TAM = 10;
const MARGEN = 50;
const INTERLINEADO = 14;

/** Sustituye por «?» lo que Helvetica (WinAnsi) no puede codificar, para que pdf-lib no lance. */
function aWinAnsi(texto: string, fuente: PDFFont): string {
  const soportados = new Set(fuente.getCharacterSet());
  return [...texto].map((c) => (soportados.has(c.codePointAt(0) ?? 0) ? c : "?")).join("");
}

function partirLinea(linea: string, fuente: PDFFont, ancho: number): string[] {
  const salida: string[] = [];
  let actual = "";
  for (const palabra of linea.split(" ")) {
    const prueba = actual === "" ? palabra : `${actual} ${palabra}`;
    if (actual !== "" && fuente.widthOfTextAtSize(prueba, TAM) > ancho) {
      salida.push(actual);
      actual = palabra;
    } else actual = prueba;
  }
  salida.push(actual);
  return salida;
}

async function construirPdf(texto: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  let pagina = doc.addPage();
  const ancho = pagina.getWidth() - 2 * MARGEN;
  let y = pagina.getHeight() - MARGEN;
  for (const original of texto.split("\n")) {
    for (const linea of partirLinea(aWinAnsi(original, fuente), fuente, ancho)) {
      if (y < MARGEN) {
        pagina = doc.addPage();
        y = pagina.getHeight() - MARGEN;
      }
      pagina.drawText(linea, { x: MARGEN, y, size: TAM, font: fuente });
      y -= INTERLINEADO;
    }
  }
  return doc.save();
}

export async function escribirEvidencia(directory: string, caso: string, aprobacion: Aprobacion): Promise<EvidenciaGenerada> {
  const rutaTxt = path.posix.join("out", caso, "aprobacion.txt");
  const rutaPdf = path.posix.join("out", caso, "aprobacion.pdf");
  const texto = textoEvidencia(aprobacion);
  await mkdir(path.join(directory, "out", caso), { recursive: true });
  await writeFile(path.join(directory, rutaTxt), texto, "utf8");
  await writeFile(path.join(directory, rutaPdf), await construirPdf(texto));
  return { ruta: rutaTxt, sha256: shaEvidencia(aprobacion), pdf: rutaPdf };
}
