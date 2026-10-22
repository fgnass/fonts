# fonts.gnass.buzz

Find the right Google Font by how it looks, not by its name or category.

## What you can do

- **Search by shape:** draw a letter, or pick a font you like, and find fonts where the letters have a similar shape.
- **Filter by look:** set ranges on sliders for weight, width, contrast, serifs, x-height, ornament and more. Every slider is based on values measured from the fonts themselves.
- **Filter by features:** find fonts with the glyphs, OpenType features, ligatures, variable axes or styles you need.
- **Hide look-alikes:** see only one font from each group of fonts that look almost the same.
- **Compare a shortlist:** star fonts and compare them side by side with your own text, in different sizes and in heading/body pairs.

## Quick start

```sh
npm install
make        # builds the font data in public/data/ (needs Node and uv)
npm run dev
```

## How it works

Every glyph is reduced to its center line (an approximation of the medial axis). A drawing is compared with these center lines by chamfer distance plus a term for the number and position of stroke ends. A font chosen as an example is compared by DINOv2 features of its center lines. The sliders are values measured from the outlines, without categories or training.

The idea of searching by drawing comes from [Shapecatcher](https://shapecatcher.com) by Benjamin Milde, which does the same for Unicode characters.

- [docs/METHOD.md](docs/METHOD.md): the methods, an evaluation (sliders against crowdsourced judgments, shape search on synthetic sketches), related work and limitations.
- [docs/PIPELINE.md](docs/PIPELINE.md): how to build the data, run the evaluation, and where the code is.

## License

MIT, see [LICENSE](LICENSE). The fonts are not part of this project; each Google Font has its own license.
