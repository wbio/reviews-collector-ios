'use strict';

const expect = require('chai').expect;
const _ = require('lodash');
const Collector = require('../lib/index.js');

/* eslint-disable no-undef, max-len, no-unused-expressions */
describe('integration testing', () => {
	describe('parsing the current version of the iTunes store', () => {
		// Use Google Maps because we shouldn't have to worry about it going away
		const collector = new Collector('585027354', { maxPages: 1 });
		let result;
		let hadError;

		before((done) => {
			collector.on('page complete', (pageResult) => {
				result = pageResult;
				done();
			});

			collector.on('done collecting', (err) => {
				if (typeof result === 'undefined' && err) {
					hadError = true;
					done();
				}
			});

			collector.collect();
		});

		it('should result in some reviews', () => {
			expect(result).to.exist;
			expect(result).to.have.a.property('reviews');
			expect(_.isArray(result.reviews)).to.be.true;
			expect(result.reviews.length).to.be.at.least(1);
		});

		it('should not result in an error', () => {
			expect(hadError).to.be.undefined;
		});

		it('should include values for (almost) all fields', () => {
			expect(_.isArray(result.reviews)).to.be.true;
			const fields = {
				appId: 0,
				os: 0,
				device: 0,
				type: 0,
				id: 0,
				date: 0,
				rating: 0,
				title: 0,
				text: 0,
			};
			// Add up the number of times each field was present
			_.forEach(result.reviews, (review) => {
				if (review.appId) { fields.appId++; }
				if (review.os) { fields.os++; }
				if (review.device) { fields.device++; }
				if (review.type) { fields.type++; }
				if (review.id) { fields.id++; }
				if (review.date) { fields.date++; }
				if (review.rating) { fields.rating++; }
				if (review.title) { fields.title++; }
				if (review.text) { fields.text++; }
			});
			const numReviews = result.reviews.length;
			// Check all of the mandatory fields
			expect(fields.appId).to.equal(numReviews);
			expect(fields.os).to.equal(numReviews);
			expect(fields.device).to.equal(numReviews);
			expect(fields.type).to.equal(numReviews);
			expect(fields.id).to.equal(numReviews);
			expect(fields.date).to.equal(numReviews);
			expect(fields.rating).to.equal(numReviews);
			// Check our optional fields to make sure they were present at least once
			// These could technically show up 0 times, but the chances of that are low
			expect(fields.title).to.be.at.least(1);
			expect(fields.text).to.be.at.least(1);
		});
	});
});
/* eslint-enable no-undef, max-len, no-unused-expressions */
