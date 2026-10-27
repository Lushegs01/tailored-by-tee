# Camera Roll import — October 2026

Where the studio photography in `public/images` came from, and which product and
category each file feeds. Source files stay where they were shot
(`Pictures/Camera Roll`); nothing here overwrote them.

## How the files were made

Every card and gallery frame in the storefront is a hard 4:5 with `object-cover`
(`MediaImage`), so each file is written at 4:5 on the way in rather than being
cropped by the browser:

- **Screenshots** (22 of the 48 — the files at a phone's own 562px or 591px width)
  had their letterbox bars and status / navigation / comment chrome trimmed off
  first, keeping only the photograph.
- **`cover`** — the source sits between 0.66 and 0.92, close enough to 4:5 that a
  centre crop loses nothing of the garment.
- **`contain`** — the source is too square or too tall to crop without cutting the
  product, so it is fitted whole and the rest of the frame filled with a blurred,
  desaturated copy of the same photograph rather than a flat bar.

Files are written at up to 1600×2000, never upscaled past 1.5× their own
resolution, at JPEG q86. Each one carries a generated blur placeholder and
dominant colour in `src/data/media.json`.

## Not imported

| Source | Shows | Why not |
| --- | --- | --- |
| `WhatsApp Image 2026-10-25 at 6.24.48 PM.jpeg` | A toddler in a white senator set and a multicoloured aso-oke fila | Children's wear. The catalogue has no kids' category and the size registry holds adult apparel, waist and belt sizes only, so there is nothing to list it against. The cap is a real product but is too small in frame to carry a card. |

## Imported, by category

### agbada — 4 product(s), 8 image(s)

| Product | View | Source file | Source px | Imported file | Fit |
| --- | --- | --- | --- | --- | --- |
| woven-motif-agbada | primary | `WhatsApp Image 2026-10-25 at 6.24.54 PM (1).jpeg` | 1125×1043 | `/images/products/woven-motif-agbada/woven-motif-agbada-01.jpg` | contain |
| woven-motif-agbada | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.54 PM (1).jpeg` | 1125×1043 | `/images/products/woven-motif-agbada/woven-motif-agbada-02.jpg` | contain |
| diamond-motif-agbada | primary | `WhatsApp Image 2026-10-25 at 6.24.55 PM (1).jpeg` | 720×710 | `/images/products/diamond-motif-agbada/diamond-motif-agbada-01.jpg` | contain |
| diamond-motif-agbada | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.55 PM (1).jpeg` | 720×710 | `/images/products/diamond-motif-agbada/diamond-motif-agbada-02.jpg` | cover |
| column-motif-agbada | primary | `WhatsApp Image 2026-10-25 at 6.24.56 PM (2).jpeg` | 828×882 | `/images/products/column-motif-agbada/column-motif-agbada-01.jpg` | contain |
| column-motif-agbada | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.56 PM (2).jpeg` | 828×882 | `/images/products/column-motif-agbada/column-motif-agbada-02.jpg` | cover |
| navy-geometric-agbada | primary | `WhatsApp Image 2026-10-25 at 6.24.57 PM (3).jpeg` | 817×1024 | `/images/products/navy-geometric-agbada/navy-geometric-agbada-01.jpg` | cover |
| navy-geometric-agbada | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.57 PM (3).jpeg` | 817×1024 | `/images/products/navy-geometric-agbada/navy-geometric-agbada-02.jpg` | cover |

### caps — 4 product(s), 9 image(s)

| Product | View | Source file | Source px | Imported file | Fit |
| --- | --- | --- | --- | --- | --- |
| beaded-velvet-fila | primary (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.50 PM.jpeg` | 562×1280 | `/images/products/beaded-velvet-fila/beaded-velvet-fila-01.jpg` | cover |
| beaded-velvet-fila | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.50 PM.jpeg` | 562×1280 | `/images/products/beaded-velvet-fila/beaded-velvet-fila-02.jpg` | contain |
| plain-wool-fila | primary | `WhatsApp Image 2026-10-25 at 6.24.51 PM (1).jpeg` | 1100×1146 | `/images/products/plain-wool-fila/plain-wool-fila-01.jpg` | contain |
| plain-wool-fila | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.51 PM (1).jpeg` | 1100×1146 | `/images/products/plain-wool-fila/plain-wool-fila-02.jpg` | contain |
| aso-oke-patterned-fila | primary | `WhatsApp Image 2026-10-25 at 6.24.51 PM (2).jpeg` | 1099×1109 | `/images/products/aso-oke-patterned-fila/aso-oke-patterned-fila-01.jpg` | contain |
| aso-oke-patterned-fila | alternate | `WhatsApp Image 2026-10-25 at 6.24.54 PM.jpeg` | 1125×824 | `/images/products/aso-oke-patterned-fila/aso-oke-patterned-fila-02.jpg` | contain |
| aso-oke-patterned-fila | gallery (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.51 PM (2).jpeg` | 1099×1109 | `/images/products/aso-oke-patterned-fila/aso-oke-patterned-fila-03.jpg` | contain |
| embroidered-cotton-cap | primary | `WhatsApp Image 2026-10-25 at 6.24.51 PM.jpeg` | 1026×1280 | `/images/products/embroidered-cotton-cap/embroidered-cotton-cap-01.jpg` | cover |
| embroidered-cotton-cap | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.51 PM.jpeg` | 1026×1280 | `/images/products/embroidered-cotton-cap/embroidered-cotton-cap-02.jpg` | contain |

### kaftans — 4 product(s), 9 image(s)

| Product | View | Source file | Source px | Imported file | Fit |
| --- | --- | --- | --- | --- | --- |
| charcoal-mandarin-kaftan | primary | `WhatsApp Image 2026-10-25 at 6.24.49 PM (1).jpeg` | 968×1280 | `/images/products/charcoal-mandarin-kaftan/charcoal-mandarin-kaftan-01.jpg` | cover |
| charcoal-mandarin-kaftan | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.49 PM (1).jpeg` | 968×1280 | `/images/products/charcoal-mandarin-kaftan/charcoal-mandarin-kaftan-02.jpg` | cover |
| white-kaftan-set | primary | `WhatsApp Image 2026-10-25 at 6.24.49 PM.jpeg` | 949×1280 | `/images/products/white-kaftan-set/white-kaftan-set-01.jpg` | cover |
| white-kaftan-set | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.49 PM.jpeg` | 949×1280 | `/images/products/white-kaftan-set/white-kaftan-set-02.jpg` | cover |
| black-senator-set | primary | `WhatsApp Image 2026-10-25 at 6.24.50 PM (3).jpeg` | 1063×1280 | `/images/products/black-senator-set/black-senator-set-01.jpg` | cover |
| black-senator-set | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.50 PM (3).jpeg` | 1063×1280 | `/images/products/black-senator-set/black-senator-set-02.jpg` | contain |
| sage-embroidered-kaftan | primary | `WhatsApp Image 2026-10-25 at 6.24.53 PM (1).jpeg` | 562×1280 | `/images/products/sage-embroidered-kaftan/sage-embroidered-kaftan-01.jpg` | contain |
| sage-embroidered-kaftan | alternate | `WhatsApp Image 2026-10-25 at 6.24.54 PM (2).jpeg` | 562×1280 | `/images/products/sage-embroidered-kaftan/sage-embroidered-kaftan-02.jpg` | contain |
| sage-embroidered-kaftan | gallery (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.53 PM (1).jpeg` | 562×1280 | `/images/products/sage-embroidered-kaftan/sage-embroidered-kaftan-03.jpg` | contain |

### knitwear — 2 product(s), 4 image(s)

| Product | View | Source file | Source px | Imported file | Fit |
| --- | --- | --- | --- | --- | --- |
| cable-knit-vest | primary | `WhatsApp Image 2026-10-25 at 6.24.52 PM (2).jpeg` | 963×1280 | `/images/products/cable-knit-vest/cable-knit-vest-01.jpg` | cover |
| cable-knit-vest | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.52 PM (2).jpeg` | 963×1280 | `/images/products/cable-knit-vest/cable-knit-vest-02.jpg` | contain |
| ribbed-knit-polo | primary | `WhatsApp Image 2026-10-25 at 6.24.57 PM (2).jpeg` | 1088×1280 | `/images/products/ribbed-knit-polo/ribbed-knit-polo-01.jpg` | cover |
| ribbed-knit-polo | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.57 PM (2).jpeg` | 1088×1280 | `/images/products/ribbed-knit-polo/ribbed-knit-polo-02.jpg` | cover |

### outerwear — 2 product(s), 5 image(s)

| Product | View | Source file | Source px | Imported file | Fit |
| --- | --- | --- | --- | --- | --- |
| double-breasted-wool-jacket | primary | `WhatsApp Image 2026-10-25 at 6.24.52 PM.jpeg` | 591×1280 | `/images/products/double-breasted-wool-jacket/double-breasted-wool-jacket-01.jpg` | cover |
| double-breasted-wool-jacket | alternate | `WhatsApp Image 2026-10-25 at 6.24.53 PM (3).jpeg` | 591×1280 | `/images/products/double-breasted-wool-jacket/double-breasted-wool-jacket-02.jpg` | cover |
| double-breasted-wool-jacket | gallery | `WhatsApp Image 2026-10-25 at 6.24.50 PM (1).jpeg` | 591×1280 | `/images/products/double-breasted-wool-jacket/double-breasted-wool-jacket-03.jpg` | cover |
| suede-harrington-jacket | primary | `WhatsApp Image 2026-10-25 at 6.24.56 PM (1).jpeg` | 939×1280 | `/images/products/suede-harrington-jacket/suede-harrington-jacket-01.jpg` | cover |
| suede-harrington-jacket | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.56 PM (1).jpeg` | 939×1280 | `/images/products/suede-harrington-jacket/suede-harrington-jacket-02.jpg` | cover |

### sets — 7 product(s), 14 image(s)

| Product | View | Source file | Source px | Imported file | Fit |
| --- | --- | --- | --- | --- | --- |
| navy-knit-polo-set | primary | `WhatsApp Image 2026-10-25 at 6.24.48 PM (3).jpeg` | 591×1280 | `/images/products/navy-knit-polo-set/navy-knit-polo-set-01.jpg` | cover |
| navy-knit-polo-set | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.48 PM (3).jpeg` | 591×1280 | `/images/products/navy-knit-polo-set/navy-knit-polo-set-02.jpg` | cover |
| brown-overshirt-set | primary (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.49 PM (2).jpeg` | 1125×1115 | `/images/products/brown-overshirt-set/brown-overshirt-set-01.jpg` | cover |
| brown-overshirt-set | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.49 PM (2).jpeg` | 1125×1115 | `/images/products/brown-overshirt-set/brown-overshirt-set-02.jpg` | contain |
| ankara-print-shirt-set | primary | `WhatsApp Image 2026-10-25 at 6.24.53 PM (2).jpeg` | 562×1280 | `/images/products/ankara-print-shirt-set/ankara-print-shirt-set-01.jpg` | contain |
| ankara-print-shirt-set | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.53 PM (2).jpeg` | 562×1280 | `/images/products/ankara-print-shirt-set/ankara-print-shirt-set-02.jpg` | contain |
| palm-embroidered-camp-set | primary | `WhatsApp Image 2026-10-25 at 6.24.56 PM (3).jpeg` | 880×1280 | `/images/products/palm-embroidered-camp-set/palm-embroidered-camp-set-01.jpg` | cover |
| palm-embroidered-camp-set | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.56 PM (3).jpeg` | 880×1280 | `/images/products/palm-embroidered-camp-set/palm-embroidered-camp-set-02.jpg` | cover |
| afro-print-shirt-set | primary | `WhatsApp Image 2026-10-25 at 6.24.57 PM (4).jpeg` | 562×1280 | `/images/products/afro-print-shirt-set/afro-print-shirt-set-01.jpg` | contain |
| afro-print-shirt-set | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.57 PM (4).jpeg` | 562×1280 | `/images/products/afro-print-shirt-set/afro-print-shirt-set-02.jpg` | contain |
| striped-zip-polo-set | primary | `WhatsApp Image 2026-10-25 at 6.24.57 PM.jpeg` | 562×1280 | `/images/products/striped-zip-polo-set/striped-zip-polo-set-01.jpg` | contain |
| striped-zip-polo-set | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.57 PM.jpeg` | 562×1280 | `/images/products/striped-zip-polo-set/striped-zip-polo-set-02.jpg` | cover |
| cream-overshirt-set | primary | `WhatsApp Image 2026-10-25 at 6.24.58 PM.jpeg` | 591×1280 | `/images/products/cream-overshirt-set/cream-overshirt-set-01.jpg` | cover |
| cream-overshirt-set | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.58 PM.jpeg` | 591×1280 | `/images/products/cream-overshirt-set/cream-overshirt-set-02.jpg` | cover |

### shirts — 2 product(s), 4 image(s)

| Product | View | Source file | Source px | Imported file | Fit |
| --- | --- | --- | --- | --- | --- |
| card-print-camp-shirt | primary | `WhatsApp Image 2026-10-25 at 6.24.50 PM (2).jpeg` | 910×1280 | `/images/products/card-print-camp-shirt/card-print-camp-shirt-01.jpg` | cover |
| card-print-camp-shirt | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.50 PM (2).jpeg` | 910×1280 | `/images/products/card-print-camp-shirt/card-print-camp-shirt-02.jpg` | contain |
| line-art-camp-shirt | primary | `WhatsApp Image 2026-10-25 at 6.24.56 PM.jpeg` | 1125×1277 | `/images/products/line-art-camp-shirt/line-art-camp-shirt-01.jpg` | cover |
| line-art-camp-shirt | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.56 PM.jpeg` | 1125×1277 | `/images/products/line-art-camp-shirt/line-art-camp-shirt-02.jpg` | cover |

### tailoring — 3 product(s), 6 image(s)

| Product | View | Source file | Source px | Imported file | Fit |
| --- | --- | --- | --- | --- | --- |
| pinstripe-double-breasted-suit | primary | `WhatsApp Image 2026-10-25 at 6.24.52 PM (1).jpeg` | 1099×1280 | `/images/products/pinstripe-double-breasted-suit/pinstripe-double-breasted-suit-01.jpg` | cover |
| pinstripe-double-breasted-suit | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.52 PM (1).jpeg` | 1099×1280 | `/images/products/pinstripe-double-breasted-suit/pinstripe-double-breasted-suit-02.jpg` | contain |
| charcoal-peak-lapel-suit | primary | `WhatsApp Image 2026-10-25 at 6.24.54 PM (3).jpeg` | 562×1280 | `/images/products/charcoal-peak-lapel-suit/charcoal-peak-lapel-suit-01.jpg` | cover |
| charcoal-peak-lapel-suit | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.54 PM (3).jpeg` | 562×1280 | `/images/products/charcoal-peak-lapel-suit/charcoal-peak-lapel-suit-02.jpg` | cover |
| royal-blue-two-piece-suit | primary | `WhatsApp Image 2026-10-25 at 6.24.55 PM (2).jpeg` | 562×1280 | `/images/products/royal-blue-two-piece-suit/royal-blue-two-piece-suit-01.jpg` | cover |
| royal-blue-two-piece-suit | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.55 PM (2).jpeg` | 562×1280 | `/images/products/royal-blue-two-piece-suit/royal-blue-two-piece-suit-02.jpg` | cover |

### trousers — 6 product(s), 17 image(s)

| Product | View | Source file | Source px | Imported file | Fit |
| --- | --- | --- | --- | --- | --- |
| classic-tailored-trousers | primary | `WhatsApp Image 2026-10-25 at 6.24.48 PM (2).jpeg` | 960×1280 | `/images/products/classic-tailored-trousers/classic-tailored-trousers-01.jpg` | cover |
| classic-tailored-trousers | alternate | `WhatsApp Image 2026-10-25 at 6.24.53 PM.jpeg` | 1087×1280 | `/images/products/classic-tailored-trousers/classic-tailored-trousers-02.jpg` | cover |
| classic-tailored-trousers | gallery | `WhatsApp Image 2026-10-25 at 6.24.58 PM (1).jpeg` | 1005×1280 | `/images/products/classic-tailored-trousers/classic-tailored-trousers-03.jpg` | cover |
| classic-tailored-trousers | gallery | `WhatsApp Image 2026-10-25 at 6.24.55 PM (3).jpeg` | 562×1280 | `/images/products/classic-tailored-trousers/classic-tailored-trousers-04.jpg` | cover |
| wide-leg-trousers | primary | `WhatsApp Image 2026-10-25 at 6.24.57 PM (1).jpeg` | 1080×1050 | `/images/products/wide-leg-trousers/wide-leg-trousers-01.jpg` | contain |
| wide-leg-trousers | alternate | `WhatsApp Image 2026-10-25 at 6.24.53 PM (4).jpeg` | 1125×1112 | `/images/products/wide-leg-trousers/wide-leg-trousers-02.jpg` | contain |
| wide-leg-trousers | gallery | `WhatsApp Image 2026-10-25 at 6.24.55 PM.jpeg` | 591×1280 | `/images/products/wide-leg-trousers/wide-leg-trousers-03.jpg` | cover |
| pleated-shop-trousers | primary | `WhatsApp Image 2026-10-25 at 6.24.48 PM (1).jpeg` | 562×1280 | `/images/products/pleated-shop-trousers/pleated-shop-trousers-01.jpg` | cover |
| pleated-shop-trousers | alternate | `WhatsApp Image 2026-10-25 at 6.24.58 PM (2).jpeg` | 562×1280 | `/images/products/pleated-shop-trousers/pleated-shop-trousers-02.jpg` | cover |
| pleated-shop-trousers | gallery | `WhatsApp Image 2026-10-25 at 6.24.50 PM (4).jpeg` | 562×1280 | `/images/products/pleated-shop-trousers/pleated-shop-trousers-03.jpg` | cover |
| pleated-shop-trousers | gallery | `WhatsApp Image 2026-10-25 at 6.24.58 PM (3).jpeg` | 562×1280 | `/images/products/pleated-shop-trousers/pleated-shop-trousers-04.jpg` | cover |
| side-stripe-trousers | primary | `WhatsApp Image 2026-10-25 at 6.24.49 PM (3).jpeg` | 562×1280 | `/images/products/side-stripe-trousers/side-stripe-trousers-01.jpg` | cover |
| side-stripe-trousers | alternate | `WhatsApp Image 2026-10-25 at 6.24.51 PM (3).jpeg` | 562×1280 | `/images/products/side-stripe-trousers/side-stripe-trousers-02.jpg` | cover |
| herringbone-trousers | primary | `WhatsApp Image 2026-10-25 at 6.24.52 PM (3).jpeg` | 985×1280 | `/images/products/herringbone-trousers/herringbone-trousers-01.jpg` | cover |
| herringbone-trousers | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.52 PM (3).jpeg` | 985×1280 | `/images/products/herringbone-trousers/herringbone-trousers-02.jpg` | cover |
| adire-stripe-wide-trousers | primary | `WhatsApp Image 2026-10-25 at 6.24.59 PM.jpeg` | 591×1280 | `/images/products/adire-stripe-wide-trousers/adire-stripe-wide-trousers-01.jpg` | cover |
| adire-stripe-wide-trousers | alternate (detail crop) | `WhatsApp Image 2026-10-25 at 6.24.59 PM.jpeg` | 591×1280 | `/images/products/adire-stripe-wide-trousers/adire-stripe-wide-trousers-02.jpg` | cover |

## Category images

| Category | Source file | Imported file |
| --- | --- | --- |
| caps | `WhatsApp Image 2026-10-25 at 6.24.51 PM.jpeg` | `/images/categories/caps.jpg` |
| agbada | `WhatsApp Image 2026-10-25 at 6.24.57 PM (3).jpeg` | `/images/categories/agbada.jpg` |
| kaftans | `WhatsApp Image 2026-10-25 at 6.24.49 PM.jpeg` | `/images/categories/kaftans.jpg` |
| sets | `WhatsApp Image 2026-10-25 at 6.24.56 PM (3).jpeg` | `/images/categories/sets.jpg` |

## Still to confirm

Prices, size ranges and cloth descriptions on the 34 products added here are
**provisional**. The photographs establish colour, cut and visible construction and
nothing more; fibre composition, weights, measurements, stock and price all need the
studio's own figures before this catalogue is shown to customers. Stock is the seed
catalogue's deterministic demo stock, as for every other product in the file.
