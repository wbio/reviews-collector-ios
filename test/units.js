'use strict';

const chai = require('chai');
const expect = chai.expect;
const rewire = require('rewire');
const sinon = require('sinon');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events').EventEmitter;
chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

/*
 * Reconfigure module for our tests
 */
const Collector = rewire('../lib/index.js');
// Mute the module's console
Collector.__set__({
	console: {
		log: () => null,
		error: () => null,
	},
});
// Spy on the module's console
const errSpy = sinon.spy(Collector.__get__('console'), 'error');
const logSpy = sinon.spy(Collector.__get__('console'), 'log');

/*
 * Setup fixtures
 */
const fixturesDir = path.join(__dirname, 'fixtures');
const validResponse = fs.readFileSync(`${fixturesDir}/valid.txt`, 'utf8');
const invalidResponse = fs.readFileSync(`${fixturesDir}/invalid.txt`, 'utf8');
const noReviewsResponse = fs.readFileSync(`${fixturesDir}/noreviews.txt`, 'utf8');

/* eslint-disable no-undef, max-len, no-unused-expressions */
describe('unit testing', () => {
	const validResponseXml = { body: validResponse };
	const invalidResponseXml = { body: invalidResponse };
	const noReviewsResponseXml = { body: noReviewsResponse };

	describe('parsing response to an object', () => {
		it('should parse a valid XML response to an object', () => {
			const val = Collector.__get__('responseToObject')(validResponseXml);
			return expect(val).to.eventually.be.an('object');
		});

		it('should parse a valid XML response with no reviews to an object', () => {
			const val = Collector.__get__('responseToObject')(noReviewsResponseXml);
			return expect(val).to.eventually.be.an('object');
		});

		it('should parse an invalid XML response to an object', () => {
			const val = Collector.__get__('responseToObject')(invalidResponseXml);
			return expect(val).to.eventually.be.an('object');
		});
	});

	describe('parsing XML into reviews', () => {
		// Get our response objects
		const validObjPromise = Collector.__get__('responseToObject')(validResponseXml);
		const invalidObjPromise = Collector.__get__('responseToObject')(invalidResponseXml);
		const noReviewsObjPromise = Collector.__get__('responseToObject')(noReviewsResponseXml);
		// Create our fake emitter
		const fakeEmitter = {
			emit: () => null,
		};

		it('should parse a valid response object into an array of reviews', (done) => {
			validObjPromise.then((validObj) => {
				const converted = Collector.__get__('objectToReviews')(validObj, 'an.app.id', 0, fakeEmitter.emit);
				expect(converted).to.be.an('object');
				expect(converted).to.have.a.property('reviews');
				expect(converted).to.not.have.a.property('error');
				expect(_.isArray(converted.reviews)).to.be.true;
				expect(converted.reviews.length).to.equal(25);
				done();
			});
		});

		it('should parse a valid response object with no reviews into an empty array of reviews', (done) => {
			noReviewsObjPromise.then((noReviewsObj) => {
				const converted = Collector.__get__('objectToReviews')(noReviewsObj, 'an.app.id', 0, fakeEmitter.emit);
				expect(converted).to.be.an('object');
				expect(converted).to.have.a.property('reviews');
				expect(converted).to.not.have.a.property('error');
				expect(_.isArray(converted.reviews)).to.be.true;
				expect(converted.reviews.length).to.equal(0);
				done();
			});
		});

		it('should log an error when given an invalid response object', (done) => {
			invalidObjPromise.then((invalidObj) => {
				const converted = Collector.__get__('objectToReviews')(invalidObj, 'an.app.id', 0, fakeEmitter.emit);
				expect(converted).to.be.an('object');
				expect(converted).to.have.a.property('error');
				done();
			});
		});

		it('should emit a "review" event for each review', (done) => {
			// Set up our spy on the event emitter
			const emitterSpy = sinon.spy();
			// Call the method
			validObjPromise.then((validObj) => {
				Collector.__get__('objectToReviews')(validObj, 'an.app.id', 0, emitterSpy);
				expect(emitterSpy.callCount).to.equal(25);
				done();
			});
		});
	});
});
/* eslint-enable no-undef, max-len, no-unused-expressions */
