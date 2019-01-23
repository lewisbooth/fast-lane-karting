# AMP Responsive Boilerplate
A super-minimal static site generator with an efficient workflow.

### Gulp
[Gulp](https://gulpjs.com/) is the core of the boilerplate. It automatically compiles the website and assets into the /dist folder.
Changes to Pug, Stylus and JS files will be compiled and injected via [BrowserSync](https://browsersync.io/) automatically when added or changed.

Simply type `npm install` followed by `gulp` to begin.

### Pug
[Pug](https://www.pugjs.org) is used for the HTML templating. Templates for the head, nav and script blocks are included by default, along with helpful hints for asset pre-loading and inlining styles for production.

### Stylus
[Stylus](http://stylus-lang.com/) is set up with basic colours, buttons, grid system and mobile responsive navigation.

### PostCSS
[PostCSS](http://postcss.org/) augments Stylus with automatic browser prefixing and minifies the resulting CSS.

### Babel
[Babel](https://babeljs.io/) transpiles ES6 syntax into ES5 for browser compatibility.