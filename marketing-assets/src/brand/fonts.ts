/**
 * Geist and Geist Mono, the families next/font loads for the site, here from
 * Google Fonts through @remotion/google-fonts (which holds every frame until
 * the faces have loaded). Only the weights the videos and stills draw.
 */
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

export const geist = loadGeist("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
}).fontFamily;

export const geistMono = loadGeistMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
}).fontFamily;
