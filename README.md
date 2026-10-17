<p align="center"><img src="https://www.lumenjs.com/images/lumen_icon_yellow.svg" alt="LumenJS" width="96" /></p>

<h1 align="center">LumenJS</h1>

<p align="center">A tiny reactive JavaScript framework. Write <code>.view</code> files in plain HTML, CSS and JavaScript.<br>No virtual DOM, no build configuration.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lmjs/cli"><img src="https://img.shields.io/npm/v/@lmjs/cli?label=%40lmjs%2Fcli" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a>
  <a href="https://lumenjs.com/play">Playground</a> ·
  <a href="https://www.lumenjs.com/guide">Guide</a> ·
  <a href="https://lumenjs.com/llms.txt">llms.txt</a>
</p>

---

```html
<!-- src/views/todos.view -->
<div>
  <h1>{{ todos.filter(t => !t.done).length }} left</h1>
  <ul>
    <li :for="todos as t" @click="t.done = !t.done">{{ t.title }}</li>
  </ul>
</div>
<script>
  var todos = [
    { title: 'Write a .view file', done: false },
    { title: 'Ship it', done: false },
  ];
</script>
```

That is a whole page. Any top-level `var`/`let`/`const` in a view is reactive, so clicking a row updates the
list and the counter. There is no `useState`, no `ref()` and no JSX.

## Why LumenJS

- **Plain web code.** A view is HTML with `{{ }}`, `:for`, `:if` and `@event` attributes, a `<script>` and a
  `<style>`. If you know HTML and JavaScript, you already know most of it.
- **No build setup to maintain.** `lm serve` runs `.view` files live during development; `lm build` precompiles
  them into one static bundle that renders without a template parser.
- **Small and direct.** No virtual DOM. The runtime updates exactly the bindings that read a changed variable.
- **Routing, layouts, sub-views, forms and widgets built in.** A file in `src/views/` is a route.
- **AI-ready.** The full reference is published as plain text for coding assistants
  ([llms.txt](https://lumenjs.com/llms.txt), [llms-full.txt](https://lumenjs.com/llms-full.txt)), and
  `lm create` adds an `AGENTS.md` to every project so agents read it before writing code.

## Quick start

```bash
npm install -g @lmjs/cli
mkdir my-app && cd my-app
lm create My App  # scaffolds the project in this folder
lm serve          # develop
lm build          # static SPA in dist/, deploy anywhere
```

Or try it in the browser first: **[lumenjs.com/play](https://lumenjs.com/play)**.

## Deploy

`lm build` outputs a static site, so any static host works. LumenJS is made by the team behind
[Roxyon Distributed Cloud](https://roxyon.com), which hosts LumenJS apps and provides an optional backend
(the Roxyon BaaS). From a terminal: `npx -y @roxyon/cli init` then `npx -y @roxyon/cli deploy`; from an AI
assistant, the Roxyon MCP connector at `https://mcp.roxyon.com/mcp`.

## Packages

| Package | What it is |
|---|---|
| [`@lmjs/cli`](packages/cli) | The `lm` command: create, serve, build, update a project. |
| [`@lmjs/core`](packages/core) | The runtime. The CLI copies it into each project as `src/js/lm.js`. |

## Documentation

- Guide: https://www.lumenjs.com/guide
- Complete V2 reference (plain text, also ideal for AI assistants): https://lumenjs.com/llms-full.txt
- LumenJS pairs with [MobiusCSS](https://www.mobiuscss.com/guide), a utility-first CSS framework.

## Contributing

Issues and pull requests are welcome. This repository is the public home of the LumenJS source; each npm
release is mirrored here by the maintainers, and accepted pull requests ship in the next release. Run the tests with `pnpm install && pnpm test` (Node 20+).

## License

[MIT](LICENSE) © BEA Technologies. Bundled third-party code: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
