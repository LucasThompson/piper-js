/**
 * Created by lucast on 21/09/2016.
 */

import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import {
    ModuleRequestHandler, ResponseEnvelope, LoadResponse, ConfigurationResponse,
    ConfigurationRequest, RequestEnvelope, ProcessRequest, ProcessResponse
} from "../src/ClientServer";
import {LocalModuleRequestHandler, PluginFactory, FeatureExtractorFactory} from "../src/LocalModuleRequestHandler";
import {StaticData, Configuration} from "../src/FeatureExtractor";
import {FeatureExtractorStub, MetaDataStub} from "./fixtures/FeatureExtractorStub";
chai.should();
chai.use(chaiAsPromised);

describe("LocalModuleRequestHandler", () => {
    const metadata: StaticData = MetaDataStub;
    const factory: FeatureExtractorFactory = sr => new FeatureExtractorStub();
    const plugins: PluginFactory[] = [];
    plugins.push({extractor: factory, metadata: metadata});

    describe("List request handling", () => {
        it("Resolves to a response whose content body is {plugins: StaticData[]}", () => {
            const handler: ModuleRequestHandler = new LocalModuleRequestHandler(...plugins);
            return handler.handle({method: "list"}).then(response => {
                response.result.should.eql({plugins: [metadata]});
            });
        });
    });

    describe("Load request handling", () => {
        const handler: ModuleRequestHandler = new LocalModuleRequestHandler(...plugins);
        it("Rejects when the request contains an invalid plugin key", () => {
            const response: Promise<ResponseEnvelope> = handler.handle({
                method: "load", params: {
                    pluginKey: "not-a-real:plugin",
                    inputSampleRate: 666,
                    adapterFlags: ["AdaptAllSafe"]
                }
            });
            return response.should.eventually.be.rejected;
        });

        it("Resolves to a response where the content body is a LoadResponse", () => {
            const expectedResponse: LoadResponse = require('./fixtures/expected-load-response-js.json');
            const response: Promise<ResponseEnvelope> = handler.handle({
                method: "load", params: {
                    pluginKey: "stub:sum",
                    inputSampleRate: 16,
                    adapterFlags: ["AdaptAllSafe"]
                }
            });
            return response.then(response => {
                response.result.should.eql(expectedResponse);
            });
        })
    });

    describe("Configure request handling", () => {
        const config: Configuration = {blockSize: 8, channelCount: 1, stepSize: 8};
        const configRequest: ConfigurationRequest = {pluginHandle: 1, configuration: config};
        const loadRequest: RequestEnvelope = {
            method: "load", params: {
                pluginKey: "stub:sum",
                inputSampleRate: 16,
                adapterFlags: ["AdaptAllSafe"]
            }
        };

        it("Rejects when the request contains an invalid plugin handle", () => {
            const handler: ModuleRequestHandler = new LocalModuleRequestHandler(...plugins);
            return handler.handle({
                method: "configure",
                params: configRequest
            }).should.eventually.be.rejected;
        });

        it("Rejects when the plugin mapping to the handle in the request has already been configured", () => {
            const handler: ModuleRequestHandler = new LocalModuleRequestHandler(...plugins);
            const loadResponse: Promise<ResponseEnvelope> = handler.handle(loadRequest);
            const configure = (response: ResponseEnvelope): Promise<ResponseEnvelope> => {
                return handler.handle({
                    method: "configure",
                    params: {
                        pluginHandle: response.result.pluginHandle,
                        configuration: config
                    }
                });
            };
            return Promise.all([loadResponse.then(configure), loadResponse.then(configure)]).should.be.rejected;
        });

        it("Resolves to a response whose content body is a ConfigurationResponse", () => {
            const expectedResponse: ConfigurationResponse = require('./fixtures/expected-configuration-response-js.json');
            const handler: ModuleRequestHandler = new LocalModuleRequestHandler(...plugins);
            return handler.handle(loadRequest).then(response => {
                const configResponse: Promise<ResponseEnvelope> = handler.handle({
                    method: "configure",
                    params: {
                        pluginHandle: response.result.pluginHandle,
                        configuration: config
                    }
                });
                return configResponse.then(response => response.result.should.eql(expectedResponse));
            });
        });
    });

    describe("Process and Finish request handling", () => {
        const handler: ModuleRequestHandler = new LocalModuleRequestHandler(...plugins);
        const configResponse: Promise<ResponseEnvelope> = handler.handle({
            method: "load", params: {
                pluginKey: "stub:sum",
                inputSampleRate: 16,
                adapterFlags: ["AdaptAllSafe"]
            }
        }).then(loadResponse => {
            return handler.handle(
                {method: "configure",
                    params: {
                        pluginHandle: loadResponse.result.pluginHandle,
                        configuration: {blockSize: 8, channelCount: 1, stepSize: 8}
                    }
                })
        });

        it("Rejects when the wrong number of channels are supplied", () => {
            return configResponse.then(response => {
                const request: ProcessRequest = {
                    pluginHandle: response.result.pluginHandle,
                    processInput: {
                        timestamp: {s: 0, n: 0},
                        inputBuffers: []
                    }
                };
                return handler.handle({method: "process", params: request});
            }).should.eventually.be.rejected;
        });

        it("Rejects when the plugin handle is not valid", () => {
            const request: ProcessRequest = {
                pluginHandle: 666,
                processInput: {
                    timestamp: {s: 0, n: 0},
                    inputBuffers: []
                }
            };
            return handler.handle({method: "process", params: request}).should.eventually.be.rejected;
        });


        it("Resolves to a response whose content body contains the extracted features", () => {
            const expected: ProcessResponse = {
                pluginHandle: 1,
                features: {cumsum: [{featureValues: [8]}], sum: [{featureValues: [8]}]}
            };
            const processResponse: Promise<ResponseEnvelope> = configResponse.then(response => {
                return handler.handle({
                    method: "process",
                    params: {
                        pluginHandle: response.result.pluginHandle,
                        processInput: {
                            timestamp: {s:0, n: 0},
                            inputBuffers: [new Float32Array([1, 1, 1, 1, 1, 1, 1, 1])]
                        }
                    }
                });
            });
            return processResponse.then(response => response.result.should.eql(expected));
        });

        it("Finish - Returns the remaining features and clears up the plugin", () => {
            const expected: any = {features: {}, pluginHandle: 1};
            return configResponse
                .then(response => handler.handle({
                    method: "finish",
                    params: {pluginHandle: response.result.pluginHandle}
                }))
                .then(response => {
                    if (!response.result.should.eql(expected)) {
                        return Promise.reject("Finish did not return expected FeatureSet."); // did not pass
                    }
                    return handler.handle({
                        method: "finish",
                        params: {pluginHandle: response.result.pluginHandle}
                    }).should.eventually.be.rejected;
                });
        });
    });
});
