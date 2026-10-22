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

## Technical details

For the data pipeline, the shape search, the measurements behind the sliders and the code structure, see [docs/TECHNICAL.md](docs/TECHNICAL.md).

## License

MIT, see [LICENSE](LICENSE). The fonts are not part of this project; each Google Font has its own license.
