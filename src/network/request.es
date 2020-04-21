import axios, { CancelToken } from 'axios';
import { stringify } from 'qs';
import { invoke } from '../utils';

import { buildPaginationQuery } from './pagination';
import { getBaseUrl, getTrustedDomainRegex, getGlobalHooks } from './configuration';

const EXTERNAL_URL_PREFIX = /^https?:\/\//;

export const isExternalUrl = (url) => EXTERNAL_URL_PREFIX.test(url);
export const isTrustworthyUrl = (url) => {
  const regex = getTrustedDomainRegex();
  return regex && regex.test(url);
};

const paramsSerializer = (params) => stringify(params, { indices: false });

const getNetworkError = ({ response, request, message }) => {
  if (response) {
    return {
      ...response.data,
      statusCode: response.status ? parseInt(response.status, 10) : 500,
    };
  }

  if (request) {
    return {
      data: request,
      message: 'No response from server',
      statusCode: 500,
    };
  }

  return {
    data: message,
    message: 'Error while creating request',
    statusCode: 400,
  };
};

const getRequestConfig = (options = {}) => {
  const isExternal = isExternalUrl(options.url);
  const isTrustworthy = isTrustworthyUrl(options.url);

  let url = options.url;
  if (!isExternal) url = `${getBaseUrl()}${url}`;

  const config = {
    url,
    paramsSerializer,
    headers: { Accept: 'application/json' },
  };

  if (options.type) config.method = options.type;
  if (options.query) config.params = options.query;
  if (options.payload) config.data = options.payload;

  if (options.getAbortCallback) config.cancelToken = new CancelToken(options.getAbortCallback);

  if (options.type === 'query') {
    config.method = 'get';
    config.params = buildPaginationQuery(options.query, options.pagination);
  }

  if (options.token && (!isExternal || isTrustworthy)) {
    config.headers['X-AUTH-TOKEN'] = options.token;
  }

  if ((options.type === 'post' || options.type === 'put') && !options.multipart) {
    config.headers['Content-Type'] = 'application/json';
  }

  return config;
};

export default (options) => {
  const { requestHook, responseHook } = getGlobalHooks();
  const requestConfig = getRequestConfig(options);

  // These methods will mutate config object.
  invoke(options.customize, requestConfig, options);
  invoke(requestHook, requestConfig, options);

  const pipeResponse = (response) => {
    const body = (response && response.data) ? response.data : {};
    invoke(responseHook, body, requestConfig, options);
    return body;
  };

  const rethrowError = (error) => {
    const networkError = getNetworkError(error);

    invoke(responseHook, networkError, requestConfig, options);
    throw networkError;
  };

  return axios(requestConfig).then(pipeResponse).catch(rethrowError);
};
