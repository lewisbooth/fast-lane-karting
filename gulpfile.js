var gulp = require("gulp")
var pug = require("gulp-pug")
var stylus = require("gulp-stylus")
var postcss = require("gulp-postcss")
var autoprefixer = require("autoprefixer")
var cssnano = require("cssnano")
var babel = require("gulp-babel")
var plumber = require("gulp-plumber")
var minify = require("gulp-uglify")
var browserSync = require("browser-sync").create()

gulp.task("pug", function () {
  return gulp
    .src(["src/pug/**/*.pug", "!src/pug/_partials/**/*.pug"])
    .pipe(plumber())
    .pipe(pug({ locals: { production: true } }))
    .pipe(gulp.dest("dist"))
})

gulp.task("pug-build", function () {
  return gulp
    .src(["src/pug/**/*.pug", "!src/pug/_partials/**/*.pug"])
    .pipe(plumber())
    .pipe(pug({ locals: { production: true } }))
    .pipe(gulp.dest("dist"))
})

gulp.task("compile-scripts", function () {
  return gulp
    .src("src/js/**/*.js")
    .pipe(plumber())
    .pipe(babel({ presets: ["env"] }))
    .pipe(minify())
    .pipe(gulp.dest("dist/js"))
})

gulp.task("scripts", gulp.series("compile-scripts"), function () {
  browserSync.reload()
})

gulp.task("stylus", function () {
  var plugins = [
    autoprefixer({ browsers: ["last 3 versions"] }),
    cssnano({ discardUnused: false })
  ]
  return gulp
    .src("src/css/style.styl")
    .pipe(plumber())
    .pipe(stylus())
    .pipe(postcss(plugins))
    .pipe(gulp.dest("dist/css"))
    .pipe(browserSync.stream())
})

gulp.task("build", gulp.series("stylus", "compile-scripts", "pug-build"))

gulp.task("dev", gulp.series("stylus", "scripts", "pug", function () {
  browserSync.init({
    server: {
      baseDir: "./dist",
      middleware: function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*')
        next()
      }
    }
  })
  gulp.watch("src/css/**/*.styl", gulp.series("stylus"))
  gulp.watch("src/js/**/*.js", gulp.series("scripts", "pug"))
  gulp.watch("src/pug/**/*.pug", gulp.series("pug"))
  gulp.watch("dist/**/*.*").on("change", browserSync.reload)
}))

gulp.task("default", gulp.series("dev"))