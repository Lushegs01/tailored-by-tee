/** Care instructions shared by pieces in the same cloth — three lines each. */
export const CARE = {
  cottonJersey: [
    "Machine wash cold, inside out, with similar colours",
    "Reshape while damp and dry flat in the shade",
    "Warm iron on the reverse if needed",
  ],
  cottonWoven: [
    "Machine wash at 40°C with similar colours",
    "Dry on a hanger to limit creasing",
    "Iron while slightly damp on a hot setting",
  ],
  cottonHeavy: [
    "Machine wash at 30°C, inside out",
    "Line dry and pull back into shape while damp",
    "Iron on a medium setting",
  ],
  linen: [
    "Machine wash at 30°C with similar colours",
    "Line dry in the shade; tumble drying will shrink the cloth",
    "Iron damp on a medium setting, or wear it creased",
  ],
  linenJacket: [
    "Dry clean, or hand wash cold",
    "Dry on a shaped hanger",
    "Steam, or iron damp on a medium setting",
  ],
  silk: [
    "Hand wash cold with a gentle detergent, or dry clean",
    "Roll in a towel to remove water; never wring",
    "Iron on the reverse at a low setting",
  ],
  cottonKnit: [
    "Hand wash cold or use a delicate cycle",
    "Dry flat to keep its shape; never hang",
    "Steam rather than iron",
  ],
  wool: [
    "Hand wash cold or use a wool cycle",
    "Dry flat, away from direct sun",
    "Store folded, and air between wears rather than washing",
  ],
  denim: [
    "Wash sparingly, inside out, in cold water",
    "Line dry; do not tumble dry",
    "Colour may transfer when new — wash separately at first",
  ],
  tailoring: [
    "Dry clean only",
    "Hang on a shaped hanger between wears",
    "Steam to release creases; press through a cloth",
  ],
  suede: [
    "Specialist leather clean only",
    "Brush with a suede brush to lift the nap",
    "Keep out of heavy rain and prolonged direct sun",
  ],
  leather: [
    "Wipe clean with a dry, soft cloth",
    "Condition every few months with a neutral leather balm",
    "Store in its dust bag, away from direct sun",
  ],
  hat: ["Hand wash cold", "Reshape and dry flat", "Iron the brim on a medium setting if needed"],
} as const satisfies Record<string, readonly [string, string, string]>;
