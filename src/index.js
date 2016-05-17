'use strict';

const _ = require('lodash');
const Crawler = require('node-webcrawler');
const EventEmitter = require('events').EventEmitter;
const XMLParser = require('xml2js').parseString;


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

}

function objectToReviews(obj, appId, emitter) {

}
