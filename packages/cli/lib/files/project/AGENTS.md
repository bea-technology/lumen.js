# AGENTS.md — LumenJS project

This is a **LumenJS V2** project (`@lmjs/cli` + `@lmjs/core`). LumenJS is not Vue or React. Before writing or
changing any `.view` file, read the framework reference:

- Short guide: https://lumenjs.com/llms.txt
- Full reference: https://lumenjs.com/llms/lumenjs.txt

## Layout

- `src/views/*.view` (pages and sub-views), `src/layouts/*.layout`, `src/tpls/` (row templates), `src/index.js`
  (app start-up), `src/index.html`.
- `src/js/lm.js` is the framework runtime copied into this project. Don't edit it. After upgrading
  `@lmjs/cli`, run `lm update-core` before building.

## Commands

- `lm serve`: dev server. `lm build`: production build into `dist/`. `lm build --deploy`: build, then upload
  `dist/` using `config.json`'s `ftp` block.
- `lm create -v name` / `-s name` / `-t name`: new view / sub-view / layout.
- Pin a version without a global install: `npx -y -p @lmjs/cli@<version> lm <command>`.

## Rules that are easy to get wrong

- Top-level `var`/`let`/`const` in a view's `<script>` is reactive. There is no `bind=`.
- A `{{ }}` updates when a variable named in it changes: `{{ total() }}` goes stale if `total()` reads
  `items` internally, while `{{ items.length }}` updates.
- A `{{ }}` value that looks like HTML is rendered as HTML. Escape untrusted text yourself.
- Attribute order is priority: `<i :if="a" :for="xs as x">` gates the loop; `<i :for="xs as x" :if="x.on">`
  filters rows.
- `tpl="name"` works only on a `:for` element. `comp=` no longer exists.
- In a row's handler, changing the loop variable (`@click="t.done = !t.done"`) saves into the list (since 2.5.5)
  when the list is a variable. Looping over a computed list (`todos.filter(...)`) gives copies: change
  `todos[i]` instead.
- Use `?query` parameters for state in a URL. `#fragments` are only for scrolling to an element (2.5.5+).
- Each mounted sub-view (`view="..."`) has its own variables. Pass data in with `@init`, not `:data`.
- There is no `session` global: use `sessionStorage`.
- Never put API secrets in `config.json`. Use `lm login` + `lm api set <name>`.
