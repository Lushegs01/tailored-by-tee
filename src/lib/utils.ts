import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/*
 * tailwind-merge only knows Tailwind's default scale, so it would treat our custom
 * `text-*` type utilities as colours and drop them next to a colour class
 * (e.g. "text-label text-background" → "text-background"). Registering them as
 * font sizes keeps both.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "micro",
            "caption",
            "body-sm",
            "body",
            "lead",
            "display-xs",
            "display-sm",
            "display-md",
            "display-lg",
            "display-xl",
            "eyebrow",
            "label",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
