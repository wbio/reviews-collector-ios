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
			expect(typeof val).to.equal('object');
		});

		it('should parse a valid XML response with no reviews to an object', () => {
			const val = Collector.__get__('responseToObject')(noReviewsResponseXml);
			expect(typeof val).to.equal('object');
		});

		it('should parse an invalid XML response to an object', () => {
			const val = Collector.__get__('responseToObject')(invalidResponseXml);
			expect(typeof val).to.equal('object');
		});
	});

	describe('parsing XML into reviews', () => {
		// Get our response objects
		const validObj = Collector.__get__('responseToObject')(validResponseXml);
		const invalidObj = Collector.__get__('responseToObject')(invalidResponseXml);
		const noReviewsObj = Collector.__get__('responseToObject')(noReviewsResponseXml);
		// Create our fake emitter
		const fakeEmitter = {
			emit: () => null,
		};

		it('should parse a valid response object into an array of reviews', () => {
			const converted = Collector.__get__('objectToReviews')(validObj, 'an.app.id', fakeEmitter);
			expect(converted).to.be.an('object');
			expect(converted).to.have.a.property('reviews');
			expect(converted).to.not.have.a.property('error');
			expect(_.isArray(converted.reviews)).to.be.true;
			expect(converted.reviews.length).to.equal(40);
		});

		it('should parse a valid response object with no reviews into an empty array of reviews', () => {
			const converted = Collector.__get__('objectToReviews')(noReviewsObj, 'an.app.id', fakeEmitter);
			expect(converted).to.be.an('object');
			expect(converted).to.have.a.property('reviews');
			expect(converted).to.not.have.a.property('error');
			expect(_.isArray(converted.reviews)).to.be.true;
			expect(converted.reviews.length).to.equal(0);
		});

		it('should log an error when given an invalid response object', () => {
			const converted = Collector.__get__('objectToReviews')(invalidObj, 'an.app.id', fakeEmitter);
			expect(typeof converted).to.equal('undefined');
			expect(errSpy).to.be.calledWith('Unexpected response - app was not valid');
		});

		it('should emit a "review" event for each review', () => {
			// Set up our spy on the event emitter
			const emitterSpy = sinon.spy();
			const emitter = new EventEmitter();
			emitter.on('review', emitterSpy);
			// Call the method
			Collector.__get__('objectToReviews')(validObj, 'an.app.id', emitter);
			expect(emitterSpy.callCount).to.equal(25);
		});

		it('should emit a "page complete" event at the end of the page', () => {
			// Set up our spy on the event emitter
			const emitterSpy = sinon.spy();
			const emitter = new EventEmitter();
			emitter.on('page complete', emitterSpy);
			// Call the method
			Collector.__get__('objectToReviews')(validObj, 'an.app.id', emitter);
			expect(emitterSpy).to.be.calledOnce;
		});
	});
});
/* eslint-enable no-undef, max-len, no-unused-expressions */
