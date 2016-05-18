'use strict';

const _ = require('lodash');
const Crawler = require('node-webcrawler');
const moment = require('moment');
const P = require('bluebird');
const parseXml = P.promisify(require('xml2js').parseString);
const EventEmitter = require('events').EventEmitter;


class Collector {

	constructor(appId, options) {
		const defaults = {
			maxPages: 5,
			userAgent: 'iTunes/12.1.2 (Macintosh; OS X 10.10.3) AppleWebKit/0600.5.17',
			delay: 1000,
			maxRetries: 3,
		};
		this.options = _.assign(defaults, options);
		this.appId = appId;
		this.emitter = new EventEmitter();
		this.retries = 0;
	}

	collect() {

	}
}
module.exports = Collector;

function responseToObject(response) {
	return parseXml(response.body);
}

function objectToReviews(obj, appId, emitter) {
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
		const reviews = getReviews(reviewElems, appId, emitter);
		return {
			reviews: reviews,
		};
	} catch (err) {
		return { error: err };
	}
}

function getReviews(reviewElems, appId, emitter) {
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
		emitter.emit('review', review);
	});
	// Let our listener(s) know we finished a page
	emitter.emit('page complete', reviews);
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
