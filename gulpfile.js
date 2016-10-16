'use strict';

/**
 *  Dependencies.
 */
var _ = require('lodash');
var path = require('path');
var gulp = require('gulp');
var debug = require('gulp-debug');
var fs = require('fs');
var gulpSSH = require('gulp-ssh')({
	ignoreErrors : true,
	sshConfig : {
		host : 'tumwlfe-mooc.srv.mwn.de',
		port : 22,
		username : 'root',
		privateKey : fs.readFileSync('./deployment_rsa')
	}
});
var deployment_path = '/data/chatter';

/**
 *  Files which should be used in the lint phase.
 */
var lintFiles = [
	'public/**/*.html',
	'Routes/**/*.js',
	'Services/**/*.js',
	'index.js'
];


/**
 *  Files which should be used in the lint phase.
 */
var jsonFiles = [
	'package.json'
];

/**
 *  Gulp tasks.
 */

// Pack Build for Delivery.
gulp.task('release', ['lint'], function(cb) {
	console.log("*** Finishing Release ***");
	var releaseFiles = _.union(
		lintFiles,
		jsonFiles
	);

	return gulp.src(releaseFiles, {base: './'})
		.pipe(gulp.dest('./Release'));
});

/**
 *  Check for JavaScript errors.
 */
gulp.task('lint', function(cb) {
	return gulp.src(lintFiles);
});

gulp.task('deploy-chatter', ['release'], function() {
	console.log("IMPORTANT: YOU HAVE TO BE CONNECTED TO THE MWN VPN");
	console.log("*** Deploying Chatter API Server ***");
	return gulp.src('Release/**/*').pipe(gulpSSH.dest(deployment_path));
});