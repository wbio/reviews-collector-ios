'use strict';

const _ = require('lodash');
const Crawler = require('node-webcrawler');
const moment = require('moment');
const P = require('bluebird');
const parseXml = P.promisify(require('xml2js').parseString);
const EventEmitter = require('events').EventEmitter;
const firstPage = 0;


class Collector {

	constructor(apps, options) {
		if (options && options.maxPages && options.checkBeforeContine) {
			console.error('Warning: The \'maxPages\' option will be ignored when \'checkBeforeContine\' is present');
		}
		const defaults = {
			maxPages: 5,
			userAgent: 'iTunes/12.1.2 (Macintosh; OS X 10.10.3) AppleWebKit/0600.5.17',
			delay: 1000,
			maxRetries: 3,
		};
		this.options = _.assign(defaults, options);
		this.apps = {};
		if (_.isArray(apps)) {
			_.forEach(apps, (appId) => {
				if (typeof appId !== 'string') {
					throw new Error('App IDs must be strings');
				}
				this.apps[appId] = {
					appId: appId,
					retries: 0,
					pageNum: firstPage,
				};
			});
		} else if (_.isString(apps)) {
			// 'apps' is a single app ID string
			this.apps[apps] = {
				appId: apps,
				retries: 0,
				pageNum: firstPage,
			};
		} else {
			throw new Error('You must provide either a string or an array for the \'apps\' argument');
		}
		this.emitter = new EventEmitter();
	}

	collect() {
		// Preserve our reference to 'this'
		const self = this;
		// Get a list of app IDs
		const appIds = _.keys(self.apps);
		// Keep track of what we're processing
		let currentApp;
		let currentPage;
		let nextStepDecided;	// Whether or not 'continue()' or 'stop()' has been called

		// Setup the Crawler instance
		const c = new Crawler({
			maxConnections: 1,
			userAgent: self.options.userAgent,
			followRedirect: true,
			followAllRedirects: true,
			callback: function processRequest(error, result) {
				if (error) {
					console.error(`Could not complete the request: ${error}`);
					requeue();
				} else {
					parse(result);
				}
			},
		});

		// Queue the first app
		processNextApp();

		/**
		 * Collect reviews for the next app in the list (if one exists)
		 */
		function processNextApp() {
			if (appIds.length > 0) {
				currentApp = appIds.shift();
				currentPage = firstPage;
				queuePage();
			} else {
				self.emitter.emit('done with apps');
			}
		}

		/**
		 * Add a page to the Crawler queue to be parsed
		 * @param {number} pageNum - The page number to be collected (0-indexed)
		 */
		function queuePage() {
			// Delay the request for the specified # of milliseconds
			setTimeout(() => {
				self.apps[currentApp].pageNum = currentPage;
				const url = `https://itunes.apple.com/WebObjects/MZStore.woa/wa/viewContentsUserReviews?id=${currentApp}&pageNumber=${currentPage}&sortOrdering=4&onlyLatestVersion=false&type=Purple+Software`;
				// Add the url to the Crawler queue
				c.queue({
					uri: url,
					headers: {
						'User-Agent': self.options.userAgent,
						'X-Apple-Store-Front': '143441-1', // TODO: Allow for multiple countries
						'X-Apple-Tz': '-14400',
					},
				});
			}, self.options.delay);
		}

		/**
		 * Parse a reviews page and emit review objects
		 * @param {string} result - The page response object
		 */
		function parse(result) {
			responseToObject(result)
				.then((obj) => {
					if (typeof obj !== 'object') {
						// Something went wrong, try requeueing
						requeue();
					} else {
						// We got a valid response, proceed
						const converted = objectToReviews(obj, currentApp, currentPage, self.emitter);
						if (converted.error) {
							console.error(`Could not turn response into reviews: ${converted.error}`);
							requeue();
						} else {
							const numReviewsFound = converted.reviews.length;
							// Reset retries
							self.apps[currentApp].retries = 0;
							// Let our listener(s) know we finished a page
							const objToEmit = {
								appId: currentApp,
								pageNum: currentPage,
								reviews: converted.reviews,
							};
							// Reset nextStepDecided
							nextStepDecided = false;
							if (self.options.checkBeforeContine) {
								// stop() should always call stopProcessingApp()
								objToEmit.stop = stopProcessingApp;
								// If we had reviews, user can continue, if not, calling continue should move to next app
								if (numReviewsFound > 0) {
									objToEmit.continue = continueProcessingApp;
								} else {
									objToEmit.continue = stopProcessingApp;
								}
							}
							// Emit the object
							self.emitter.emit('page complete', objToEmit);
							// If we don't have to wait for the user to tell us to continue, we can do it ourselves
							if (!self.options.checkBeforeContine) {
								// Queue the next page if we're allowed
								if (numReviewsFound > 0 &&
									(
										self.options.maxPages === 0 ||
										currentPage + 1 < self.options.maxPages + firstPage
									)
								) {
									continueProcessingApp();
								} else {
									stopProcessingApp();
								}
							}
						}
					}
				});
		}

		/**
		 * Requeue a page if we aren't over the retries limit
		 * @param {number} pageNum - The number of the page to requeue
		 */
		function requeue() {
			self.apps[currentApp].retries++;
			if (self.apps[currentApp].retries < self.options.maxRetries) {
				queuePage();
			} else {
				// Emit the 'done collecting' event with an error
				self.emitter.emit('done collecting', {
					appId: currentApp,
					pageNum: currentPage,
					appsRemaining: appIds.length,
					error: new Error('Retry limit reached'),
				});
				// Move on to the next app
				processNextApp();
			}
		}

		/**
		 * Process the next page of the current app
		 */
		function continueProcessingApp() {
			// Make sure that the user doesn't call both stop() and continue() for the same page
			if (!nextStepDecided) {
				// Set nextStepDecided to true
				nextStepDecided = true;
				// Increment currentPage and queue it
				currentPage++;
				queuePage();
			}
		}

		/**
		 * Stop processing the current app and go on to the next app
		 */
		function stopProcessingApp() {
			// Make sure that the user doesn't call both stop() and continue() for the same page
			if (!nextStepDecided) {
				// Set nextStepDecided to true
				nextStepDecided = true;
				// Emit the 'done collecting' event
				self.emitter.emit('done collecting', {
					appId: currentApp,
					pageNum: currentPage,
					appsRemaining: appIds.length,
				});
				// Move on to the next app
				processNextApp();
			}
		}
	}

	/**
	 * Attach event handlers to the Collector's event emitter
	 * @param {string} event - The name of the event to listen for
	 * @param {funtion} action - The function to be executed each time this event is emitted
	 */
	on(event, action) {
		this.emitter.on(event, action);
	}
}
module.exports = Collector;

function responseToObject(response) {
	return parseXml(response.body);
}

function objectToReviews(obj, appId, pageNum, emitter) {
	try {
		const rootElem = obj
			.Document
			.View[0]
			.ScrollView[0]
			.VBoxView[0]
			.View[0]
			.MatrixView[0]
			.VBoxView[0];
		// Get the review elements
		const reviewElems = rootElem
			.VBoxView[0]
			.VBoxView;
		const reviews = getReviews(reviewElems, appId, pageNum, emitter);
		return {
			reviews: reviews,
		};
	} catch (err) {
		return { error: err };
	}
}

function getReviews(reviewElems, appId, pageNum, emitter) {
	const reviews = [];
	_.forEach(reviewElems, (reviewElem) => {
		const review = {};
		review.appId = appId;
		review.os = 'iOS';
		review.device = 'tbd'; // TODO - Parse this info
		review.type = 'review';
		// Review Title
		review.title = getReviewTitle(reviewElem);
		// Rating
		review.rating = getReviewRating(reviewElem);
		// Review ID
		review.id = getReviewId(reviewElem);
		// Date and Version #
		const dateAndVersion = getReviewDateAndVersion(reviewElem);
		review.version = dateAndVersion.version;
		review.date = dateAndVersion.date;
		// Review Text
		review.text = getReviewText(reviewElem);

		// Add it to our reviews array
		reviews.push(review);
		// Let our listener(s) know
		emitter.emit('review', {
			appId: appId,
			pageNum: pageNum,
			review: review,
		});
	});
	// Return our reviews
	return reviews;
}

function getReviewTitle(reviewElem) {
	return reviewElem
		.HBoxView[0]
		.TextView[0]
		.SetFontStyle[0]
		.b[0];
}

function getReviewRating(reviewElem) {
	const ratingStr = reviewElem
		.HBoxView[0]
		.HBoxView[0]
		.HBoxView[0]
		.$
		.alt;
	const ratingPatt = /^(.*?) /g;
	return Number(ratingPatt.exec(ratingStr)[1]);
}

function getReviewId(reviewElem) {
	const idStr = reviewElem
		.HBoxView[0]
		.HBoxView[0]
		.HBoxView[1]
		.VBoxView[0]
		.GotoURL[0]
		.$
		.url;
	const idPatt = /userReviewId=(.*?)$/g;
	return idPatt.exec(idStr)[1];
}

function getReviewDateAndVersion(reviewElem) {
	const dateVersion = reviewElem
		.HBoxView[1]
		.TextView[0]
		.SetFontStyle[0]
		._
		.trim()
		.replace(/\s{2,}/gm, ' ')
		.replace(/(\n|\n\r|\r)/gm, '');
	const versionPatt = / Version (.*) -/g;
	const version = versionPatt.exec(dateVersion)[1];
	const datePatt = / Version .*? - (.*?)$/g;
	const date = datePatt.exec(dateVersion)[1];
	return {
		version: version,
		date: moment(date, 'MMM D, YYYY').toDate(),
	};
}

function getReviewText(reviewElem) {
	return reviewElem
		.TextView[0]
		.SetFontStyle[0]
		._
		.trim();
}
