'use strict';

const _ = require('lodash');
const Crawler = require('node-webcrawler');
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

}
