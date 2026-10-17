# @lmjs/core

The runtime of [LumenJS](https://lumenjs.com), a tiny, fast reactive JavaScript framework for building web
applications with standard HTML, CSS and JavaScript. No virtual DOM: you write `.view` files and the runtime
renders them.

You don't normally install this package directly. Install the CLI, which bundles this runtime into every
project as `src/js/lm.js`:

```
npm install -g @lmjs/cli
lm create My Project
lm serve
```

After upgrading `@lmjs/cli`, run `lm update-core` inside each project to update its copy of the runtime.

## Documentation

- Guide: https://www.lumenjs.com/guide
- For AI coding agents, plain text: https://lumenjs.com/llms.txt (short guide) and
  https://lumenjs.com/llms/lumenjs.txt (full reference). LumenJS is not Vue or React, so read these before
  writing `.view` files.
