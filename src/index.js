'use strict';

const _ = require('lodash');
const Crawler = require('node-webcrawler');
const moment = require('moment');
const P = require('bluebird');
const parseXml = P.promisify(require('xml2js').parseString);
const EventEmitter = require('events').EventEmitter;


class Collector {

	constructor(apps, options) {
		const defaults = {
			maxPages: 5,
			userAgent: 'iTunes/12.1.2 (Macintosh; OS X 10.10.3) AppleWebKit/0600.5.17',
			delay: 1000,
			maxRetries: 3,
		};
		this.options = _.assign(defaults, options);
		if (_.isArray(apps)) {
			this.apps = apps;
		} else if (_.isString(apps)) {
			this.apps = [apps];
		} else {
			throw new Error('You must provide either a string or an array for the \'apps\' argument');
		}
		this.emitter = new EventEmitter();
		this.retries = {};
	}

	collect() {
		// Preserve our reference to 'this'
		const self = this;

		// Setup the Crawler instance
		const c = new Crawler({
			maxConnections: 1,
			rateLimits: self.options.delay,
			userAgent: self.options.userAgent,
			followRedirect: true,
			followAllRedirects: true,
			callback: function processRequest(error, result) {
				if (error) {
					console.error(`Could not complete the request: ${error}`);
					requeue(result.options.pageNum);
				} else {
					parse(result, result.options.appId, result.options.pageNum);
				}
			},
		});

		// Queue the first page for each app
		self.apps.forEach((appId) => {
			self.retries[appId] = 0;
			queue(appId, 0);
		});

		/**
		 * Add a page to the Crawler queue to be parsed
		 * @param {number} pageNum - The page number to be collected (0-indexed)
		 */
		function queue(appId, pageNum) {
			const url = `https://itunes.apple.com/WebObjects/MZStore.woa/wa/viewContentsUserReviews?id=${appId}&pageNumber=${pageNum}&sortOrdering=4&onlyLatestVersion=false&type=Purple+Software`;
			// Add the url to the Crawler queue
			c.queue({
				uri: url,
				headers: {
					'User-Agent': self.options.userAgent,
					'X-Apple-Store-Front': '143441-1', // TODO: Allow for multiple countries
					'X-Apple-Tz': '-14400',
				},
				appId: appId,
				pageNum: pageNum,
			});
		}

		/**
		 * Parse a reviews page and emit review objects
		 * @param {string} result - The page XML
		 * @param {number} pageNum - The number of the page that is being parsed
		 */
		function parse(result, appId, pageNum) {
			responseToObject(result)
				.then((obj) => {
					if (typeof obj !== 'object') {
						// Something went wrong, try requeueing
						requeue(appId, pageNum);
					} else {
						// We got a valid response, proceed
						const converted = objectToReviews(obj, appId, pageNum, self.emitter);
						if (converted.error) {
							console.error(`Could not turn response into reviews: ${converted.error}`);
							requeue(appId, pageNum);
						} else {
							// Reset retries
							self.retries[appId] = 0;
							// Queue the next page if we're allowed
							const nextPage = pageNum + 1;
							if (converted.reviews.length > 0 && nextPage < self.options.maxPages - 1) {
								queue(appId, nextPage);
							} else {
								self.emitter.emit('done collecting', {
									appId: appId,
									pageNum: pageNum,
								});
							}
						}
					}
				});
		}

		/**
		 * Requeue a page if we aren't over the retries limit
		 * @param {number} pageNum - The number of the page to requeue
		 */
		function requeue(appId, pageNum) {
			self.retries[appId]++;
			if (self.retries[appId] < self.options.maxRetries) {
				queue(appId, pageNum);
			} else {
				self.emitter.emit('done collecting', {
					appId: appId,
					pageNum: pageNum,
					error: new Error('Retry limit reached'),
				});
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
	// Let our listener(s) know we finished a page
	emitter.emit('page complete', {
		appId: appId,
		pageNum: pageNum,
		reviews: reviews,
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
		date: moment(date, 'MMM D, YYYY').format(),
	};
}

function getReviewText(reviewElem) {
	return reviewElem
		.TextView[0]
		.SetFontStyle[0]
		._
		.trim();
}
