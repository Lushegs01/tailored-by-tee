import { Instrument_Sans, Instrument_Serif } from "next/font/google";

/*
 * Grotesk for everything functional; serif reserved for editorial moments.
 * Shared by the root layout and global-error (which replaces the layout).
 */
export const fontSans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument-sans",
  display: "swap",
  axes: ["wdth"],
});

export const fontDisplay = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const fontVariables = `${fontSans.variable} ${fontDisplay.variable}`;
