<img src="https://www.lumenjs.com/images/lumen_icon_yellow.svg" alt="LumenJS Reactive JavaScript Framework" width="25%" />

# LumenJS Reactive JavaScript Framework

LumenJS is a cutting-edge, tiny, and lightning-fast reactive JavaScript framework that is set to revolutionize the way developers build dynamic user interfaces. Building scalable and high-performant web applications and web user interfaces, be it simple or complex, with standard HTML, CSS and JavaScript only.
<a href="https://www.lumenjs.com/guide" target="_blank">LumenJS Documentation</a>



LumenJS comes along with MobiusCSS which is a utility-first CSS framework packed with grid and table sectioning systems and classes like g, mt20, pv100, c and sq that can be composed to build any design, directly in your markup.
<a href="https://www.mobiuscss.com/guide" target="_blank">MobiusCSS Documentation</a>

&nbsp;

## For AI coding agents
LumenJS is not Vue or React. Read the plain-text reference before writing `.view` files:
[lumenjs.com/llms.txt](https://lumenjs.com/llms.txt) (short guide) and
[lumenjs.com/llms/lumenjs.txt](https://lumenjs.com/llms/lumenjs.txt) (full reference).
`lm create` adds an `AGENTS.md` + `CLAUDE.md` with the same pointer to every new project, and
`lm update-core` adds them to existing projects.

&nbsp;

## Installation
Using npm:
```
npm install -g @lmjs/cli
```

&nbsp;

## USAGE
Create A New Project
```
lm create My Project Name
```
You can use lu, lm, or lumen as a command.

&nbsp;

Run The Project
```
lm serve
```

&nbsp;

Create A View
```
lm create -v myview
```

&nbsp;

Create A Sub View
```
lm create -s mysubview
```

&nbsp;

Create A Template
```
lm create -t mytemplate
```

&nbsp;

Update This Project's Runtime (src/js/lm.js, src/css/mobius.css) To Match The Installed @lmjs/cli
```
lm update-core
```
Run this after updating `@lmjs/cli` globally — an existing project's runtime is copied once, at
`lm create` time, and isn't kept in sync automatically. `lm build` stops with an error if the
project's runtime is too old for the installed CLI. `lm purge` still works as an alias.

&nbsp;

Build A Dist For Production Version
```
lm build
```
(`--serverless` is accepted but no longer changes anything — this is the only
build output now. The old Node-server build mode was removed: nobody's own
projects actually shipped it, and it's not maintained going forward.)

&nbsp;

Build A Dist For Production Version & Deploy It Directly
```
lm build --deploy
```