# Product

## Register

brand

## Users

People on atproto who have just finished something (a film, a book, a game, a
livestream, a post) and want to say one blunt thing about it: "The Bear is not
relaxing". On the sofa, phone in hand, evening light, ten seconds of attention.
They arrive from an app they already use (popfeed, bookhive, cosmik, tangled) or
paste a link.

A second audience reads on a laptop: developers deciding whether to adopt the
`at.isnot.review` lexicon in their own app. The site is the advert for the
lexicon. The idea has to land in one screen.

## Product Purpose

is/not is a review layer for the whole atproto network. A review is a subject
plus one or more tags, each an adjective the subject *is* or *is not*, with a
strength. No stars, no essays. Reviews live in the reviewer's own repo; this
site reads them back and shows them as sentences.

Success: someone writes a review in under a minute without reading anything,
and a developer understands why the record shape is worth supporting from the
homepage alone.

## Brand Personality

Fun, easy, useful. Blunt but warm: opinions stated plainly, never cruelly.
The review sentence does the talking; the interface stays out of its way and
uses very few words of its own. Warm and handmade rather than slick: rounded,
tactile, like a sticker or a hand-lettered sign, not a dashboard.

## Anti-references

- Generic SaaS landing pages: hero, three feature cards, pricing grid,
  gradient buttons.
- Bluesky client clones: feed-shaped, avatars everywhere, butterfly blue.
- Review aggregators (IMDb, Goodreads): star ratings, dense metadata tables,
  ad-shaped layouts.
- Terminal or developer-tool dark mode: monospace everything, neon on black.
- Anything that reads as AI-generated: card grids, gradient text, glass panels,
  side-stripe callouts, explanatory paragraphs nobody asked for.

## Design Principles

1. **The sentence is the product.** Every surface is built around
   "@who thinks X is/is not Y". If a screen can be a sentence, it is one.
2. **Say less.** Labels, helper text and headings only where the sentence
   cannot carry the meaning. Copy is short and plain in every locale.
3. **Blunt, then kind.** Strong contrast between *is* and *is not*, but the tone
   never punishes the subject or the reviewer.
4. **Easy beats complete.** Defaults over options: a review with one adjective
   is a finished review. Advanced fields wait until asked for.
5. **Show the record.** Developers should see the shape of the data on the
   surface, not in a docs page they have to find.

## Accessibility & Inclusion

WCAG AA: contrast, visible focus, full keyboard use, reduced-motion respected
(the homepage choreography degrades to a plain swap). Adjectives and titles are
in any language and script: layouts tolerate long words, non-Latin glyphs and
RTL runs inside a sentence. Direction (is / is not) is never conveyed by colour
alone; the words carry it and colour reinforces. A review carries an optional
locale so the whole sentence can be rendered in the reviewer's language.
