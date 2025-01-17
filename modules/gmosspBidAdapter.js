import { deepAccess, getDNT, getBidIdParameter, tryAppendQueryString, isEmpty, createTrackPixelHtml, logError, deepSetValue, getWindowTop, getWindowLocation } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { config } from '../src/config.js';
import { BANNER } from '../src/mediaTypes.js';
const BIDDER_CODE = 'gmossp';
const ENDPOINT = 'https://sp.gmossp-sp.jp/hb/prebid/query.ad';

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],

  /**
   * Determines whether or not the given bid request is valid.
   *
   * @param {BidRequest} bid The bid params to validate.
   * @return boolean True if this is a valid bid, and false otherwise.
   */
  isBidRequestValid: function (bid) {
    return !!(bid.params.sid);
  },

  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {validBidRequests[]} - an array of bids
   * @return ServerRequest Info describing the request to the server.
   */
  buildRequests: function (validBidRequests, bidderRequest) {
    const bidRequests = [];

    const urlInfo = getUrlInfo(bidderRequest.refererInfo);
    const cur = getCurrencyType();
    const dnt = getDNT() ? '1' : '0';

    for (let i = 0; i < validBidRequests.length; i++) {
      let queryString = '';

      const request = validBidRequests[i];
      const tid = request.transactionId;
      const bid = request.bidId;
      const imuid = deepAccess(request, 'userId.imuid');
      const sharedId = deepAccess(request, 'userId.pubcid');
      const idlEnv = deepAccess(request, 'userId.idl_env');
      const ver = '$prebid.version$';
      const sid = getBidIdParameter('sid', request.params);

      queryString = tryAppendQueryString(queryString, 'tid', tid);
      queryString = tryAppendQueryString(queryString, 'bid', bid);
      queryString = tryAppendQueryString(queryString, 'ver', ver);
      queryString = tryAppendQueryString(queryString, 'sid', sid);
      queryString = tryAppendQueryString(queryString, 'im_uid', imuid);
      queryString = tryAppendQueryString(queryString, 'shared_id', sharedId);
      queryString = tryAppendQueryString(queryString, 'idl_env', idlEnv);
      queryString = tryAppendQueryString(queryString, 'url', urlInfo.url);
      queryString = tryAppendQueryString(queryString, 'meta_url', urlInfo.canonicalLink);
      queryString = tryAppendQueryString(queryString, 'ref', urlInfo.ref);
      queryString = tryAppendQueryString(queryString, 'cur', cur);
      queryString = tryAppendQueryString(queryString, 'dnt', dnt);

      bidRequests.push({
        method: 'GET',
        url: ENDPOINT,
        data: queryString
      });
    }
    return bidRequests;
  },

  /**
   * Unpack the response from the server into a list of bids.
   *
   * @param {*} serverResponse A successful response from the server.
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretResponse: function (bidderResponse, requests) {
    const res = bidderResponse.body;

    if (isEmpty(res)) {
      return [];
    }

    try {
      res.imps.forEach(impTracker => {
        const tracker = createTrackPixelHtml(impTracker);
        res.ad += tracker;
      });
    } catch (error) {
      logError('Error appending tracking pixel', error);
    }

    const bid = {
      requestId: res.bid,
      cpm: res.price,
      currency: res.cur,
      width: res.w,
      height: res.h,
      ad: res.ad,
      creativeId: res.creativeId,
      netRevenue: true,
      ttl: res.ttl || 300
    };

    if (res.adomains) {
      deepSetValue(bid, 'meta.advertiserDomains', Array.isArray(res.adomains) ? res.adomains : [res.adomains]);
    }

    return [bid];
  },

  /**
   * Register the user sync pixels which should be dropped after the auction.
   *
   * @param {SyncOptions} syncOptions Which user syncs are allowed?
   * @param {ServerResponse[]} serverResponses List of server's responses.
   * @return {UserSync[]} The user syncs which should be dropped.
   */
  getUserSyncs: function (syncOptions, serverResponses) {
    const syncs = [];
    if (!serverResponses.length) {
      return syncs;
    }

    serverResponses.forEach(res => {
      if (syncOptions.pixelEnabled && res.body && res.body.syncs.length) {
        res.body.syncs.forEach(sync => {
          syncs.push({
            type: 'image',
            url: sync
          })
        })
      }
    })
    return syncs;
  },

};

function getCurrencyType() {
  if (config.getConfig('currency.adServerCurrency')) {
    return config.getConfig('currency.adServerCurrency');
  }
  return 'JPY';
}

function getUrlInfo(refererInfo) {
  let canonicalLink = refererInfo.canonicalUrl;

  if (!canonicalLink) {
    let metaElements = getMetaElements();
    for (let i = 0; i < metaElements.length && !canonicalLink; i++) {
      if (metaElements[i].getAttribute('property') == 'og:url') {
        canonicalLink = metaElements[i].content;
      }
    }
  }

  return {
    url: getUrl(refererInfo),
    canonicalLink: canonicalLink,
    ref: getReferrer(),
  };
}

function getMetaElements() {
  try {
    return getWindowTop.document.getElementsByTagName('meta');
  } catch (e) {
    return document.getElementsByTagName('meta');
  }
}

function getUrl(refererInfo) {
  if (refererInfo && refererInfo.referer) {
    return refererInfo.referer;
  }

  try {
    return getWindowTop.location.href;
  } catch (e) {
    return getWindowLocation.href;
  }
}

function getReferrer() {
  try {
    return getWindowTop.document.referrer;
  } catch (e) {
    return document.referrer;
  }
}

registerBidder(spec);
