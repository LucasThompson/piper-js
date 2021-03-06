/**
 * Created by lucast on 04/10/2016.
 */
import * as base64 from "base64-js";
import {Timestamp} from "../time";
import {
    ExtractorHandle,
    ProcessRequest,
    ListResponse,
    LoadResponse,
    ConfigurationResponse,
    ProcessResponse,
    LoadRequest,
    ConfigurationRequest,
    FinishRequest,
    FinishResponse,
    ListRequest, Feature, FeatureList, InputDomain, SampleType, AdapterFlags,
    BasicDescriptor, ValueExtents, ParameterDescriptor, OutputIdentifier,
    StaticOutputDescriptor, StaticData, Framing
} from "../core";
import {
    FeatureSet
} from "../core";
import {
    Configuration} from "../core";

export namespace Serialise {
    export function ListRequest(request: ListRequest, tag?: Tag): string {
        return toTransport({method: "list", params: request}, tag);
    }

    export function ListResponse(response: ListResponse, tag?: Tag): string {
        return toTransport(
            {method: "list", result: toWireListResponse(response)},
            tag
        );
    }

    export function LoadRequest(request: LoadRequest, tag?: Tag): string {
        return toTransport(
            {method: "load", params: toWireLoadRequest(request)},
            tag
        );
    }

    export function LoadResponse(response: LoadResponse, tag?: Tag): string {
        return toTransport(
            {method: "load", result: toWireLoadResponse(response)},
            tag
        );
    }

    export function ConfigurationRequest(request: ConfigurationRequest, tag?: Tag): string {
        return toTransport(
            {method: "configure", params: toWireConfigurationRequest(request)},
            tag
        );
    }

    export function ConfigurationResponse(response: ConfigurationResponse, tag?: Tag): string {
        return toTransport(
            {method: "configure", result: toWireConfigurationResponse(response)},
            tag
        );
    }

    export function ProcessRequest(request: ProcessRequest, asBase64: boolean = true, tag?: Tag): string {
        return toTransport(
            {method: "process", params: toWireProcessRequest(request, asBase64)},
            tag
        );
    }

    export function ProcessResponse(response: ProcessResponse, asBase64: boolean = true, tag?: Tag): string {
        return toTransport(
            {method: "process", result: toWireProcessResponse(response, asBase64)},
            tag
        );
    }

    export function FinishRequest(request: FinishRequest, tag?: Tag): string {
        return toTransport(
            {method: "finish", params: request},
            tag
        );
    }

    export function FinishResponse(response: FinishResponse, asBase64: boolean = true, tag?: Tag): string {
        return toTransport(
            {method: "finish", result: toWireProcessResponse(response as ProcessResponse, asBase64)},
            tag
        );
    }
}

export namespace Parse {
    export function ListRequest(request: SerialisedJson): ListRequest {
        return toListRequest(fromTransport(request))
    }

    export function ListResponse(response: SerialisedJson): ListResponse {
        return toListResponse(fromTransport(response));
    }

    export function LoadRequest(request: SerialisedJson): LoadRequest {
        return toLoadRequest(fromTransport(request));
    }

    export function LoadResponse(response: SerialisedJson): LoadResponse {
        return toLoadResponse(fromTransport(response));
    }

    export function ConfigurationRequest(request: SerialisedJson): ConfigurationRequest {
        return toConfigurationRequest(fromTransport(request));
    }

    export function ConfigurationResponse(response: SerialisedJson): ConfigurationResponse {
        return toConfigurationResponse(fromTransport(response));
    }

    export function ProcessRequest(request: SerialisedJson): ProcessRequest {
        return toProcessRequest(fromTransport(request));
    }

    export function ProcessResponse(response: SerialisedJson): ProcessResponse {
        return toProcessResponse(fromTransport(response));
    }

    export function FinishRequest(request: SerialisedJson): FinishRequest {
        return fromTransport(request);
    }

    export function FinishResponse(response: SerialisedJson): FinishResponse {
        return ProcessResponse(response);
    }
}

type WireFeatureValues = number[] | string;

interface WireFeature {
    timestamp?: Timestamp;
    duration?: Timestamp;
    label?: string;
    featureValues?: WireFeatureValues;
}

type WireFeatureList = WireFeature[];

interface WireFeatureSet {
    [key: string]: WireFeatureList;
}

interface WireProcessResponse {
    handle: number,
    features: WireFeatureSet
}

type WireFinishResponse = WireProcessResponse;

interface WireProcessInput {
    timestamp: Timestamp;
    inputBuffers: number[][] | string[];
}

interface WireProcessRequest {
    handle: ExtractorHandle;
    processInput: WireProcessInput;
}

type WireFinishRequest = FinishRequest;

interface WireStaticOutputDescriptor {
    typeURI?: string;
}

interface WireStaticOutputInfo {
    [key: string]: WireStaticOutputDescriptor;
}

interface WireStaticData {
    key: string;
    basic: BasicDescriptor;
    maker?: string;
    rights?: string;
    version: number;
    category?: string[];
    minChannelCount: number;
    maxChannelCount: number;
    parameters?: ParameterDescriptor[];
    programs?: string[];
    inputDomain: string;
    basicOutputInfo: BasicDescriptor[];
    staticOutputInfo?: WireStaticOutputInfo;
}

type WireListRequest = ListRequest;

interface WireListResponse {
    available: WireStaticData[];
}

interface WireLoadRequest {
    key: string;
    inputSampleRate: number;
    adapterFlags: string[];
}

type WireParameters = {[key: string]: number};

interface WireConfiguration {
    channelCount: number;
    framing: Framing;
    parameterValues?: WireParameters;
    currentProgram?: string;
}

interface WireConfigurationRequest {
    handle: ExtractorHandle;
    configuration: WireConfiguration;
}

interface WireConfigurationResponse {
    handle: ExtractorHandle;
    outputList: WireOutputList;
    framing: Framing;
}

interface WireLoadResponse {
    handle: ExtractorHandle;
    staticData: WireStaticData;
    defaultConfiguration: WireConfiguration;
}

interface WireConfiguredOutputDescriptor {
    unit?: string;
    binCount?: number;
    binNames?: string[];
    extents?: ValueExtents;
    quantizeStep?: number;
    sampleType: string;
    sampleRate?: number;
    hasDuration: boolean;
}

interface WireOutputDescriptor {
    basic: BasicDescriptor;
    static?: WireStaticOutputDescriptor;
    configured: WireConfiguredOutputDescriptor;
}

type WireOutputList = WireOutputDescriptor[];

export type Tag = number | string;

function toTransport(obj: any, tag?: Tag): string {
    const value: any = tag != null ? Object.assign({}, obj, {id: tag}) : obj;
    return JSON.stringify(value);
}

export type RpcMethod = "list" | "load"  | "configure" | "process" | "finish";

interface RpcRequest {
    id: number;
    method: RpcMethod;
    params: WireListRequest
        | WireLoadRequest
        | WireConfigurationRequest
        | WireProcessRequest
        | WireFinishRequest;
}

interface ResponseError {
    code: number;
    message: string;
}

interface RpcResponse {
    method: RpcMethod;
    result?: any;
    error?: ResponseError;
}

export type SerialisedJson = string | {};

function fromTransport(buffer: SerialisedJson): any {
    const response: any = typeof buffer === 'string' ?
        JSON.parse(buffer) : buffer;

    if (response.error) throw new Error(response.error.message);
    return response.result || response.params;
}

function toWireStaticData(data: StaticData): WireStaticData {
    let staticOutputInfoObj: WireStaticOutputInfo = {};
    const shouldPopulateStaticOutputs =
        data.staticOutputInfo && data.staticOutputInfo.size > 0;
    const { staticOutputInfo, inputDomain, ...alreadyMappedData } = data;
    if (shouldPopulateStaticOutputs) {
        for (const outputId of staticOutputInfo.keys()) {
            staticOutputInfoObj[outputId] = staticOutputInfo.get(outputId);
        }
    }
    return Object.assign(
        {},
        alreadyMappedData,
        {inputDomain: InputDomain[inputDomain]},
        shouldPopulateStaticOutputs ? {
            staticOutputInfo: staticOutputInfoObj
        } : {}
    );
}

function toStaticData(data: WireStaticData): StaticData {
    let staticOutputInfoMap =
        new Map<OutputIdentifier, StaticOutputDescriptor>();
    const { staticOutputInfo, inputDomain, ...alreadyMappedData} = data;
    if (staticOutputInfo) {
        for (const outputId of Object.keys(staticOutputInfo)) {
            staticOutputInfoMap.set(outputId,
                staticOutputInfo[outputId]);
        }
    }
    return Object.assign(
        {},
        alreadyMappedData,
        {inputDomain: parseInt(InputDomain[inputDomain as any])},
        staticOutputInfoMap.size > 0 ? {
            staticOutputInfo: staticOutputInfoMap
        } : {}
    );
}

function toWireListResponse(response: ListResponse): WireListResponse {
    return {
        available: response.available.map(data => toWireStaticData(data))
    };
}

function toListRequest(request: WireListRequest): ListRequest {
    return request;
}

function toListResponse(response: WireListResponse): ListResponse {
    return {
        available: response.available.map(data => toStaticData(data))
    };
}

function toWireLoadRequest(request: LoadRequest): WireLoadRequest {
    return Object.assign({}, request, {adapterFlags: request.adapterFlags.map(flag => AdapterFlags[flag])});
}

function toLoadRequest(request: WireLoadRequest): LoadRequest {
    return {
        key: request.key,
        inputSampleRate: request.inputSampleRate,
        adapterFlags: request.adapterFlags.map(flag => parseInt(AdapterFlags[flag as any]))
    };
}

function toWireLoadResponse(response: LoadResponse): WireLoadResponse {
    return {
        handle: response.handle,
        staticData: toWireStaticData(response.staticData),
        defaultConfiguration: toWireConfiguration(response.defaultConfiguration)
    };
}

function toLoadResponse(response: WireLoadResponse): LoadResponse {
    return {
        handle: response.handle,
        staticData: toStaticData(response.staticData),
        defaultConfiguration: toConfiguration(response.defaultConfiguration)
    };
}

function toWireConfigurationRequest(request: ConfigurationRequest): WireConfigurationRequest {
    return {
        handle: request.handle,
        configuration: toWireConfiguration(request.configuration)
    }
}

function toConfigurationRequest(request: WireConfigurationRequest): ConfigurationRequest {
    return {
        handle: request.handle,
        configuration: toConfiguration(request.configuration)
    };
}

function toWireConfigurationResponse(response: ConfigurationResponse): WireConfigurationResponse {
    return Object.assign({}, response, { // TODO is this necessary? i.e. not wanting to mutate response
        outputList: response.outputList.map(output => Object.assign({}, output, {
            configured: Object.assign({}, output.configured, {
                sampleType: SampleType[output.configured.sampleType]
            })
        }))
    });
}

function toConfigurationResponse(response: WireConfigurationResponse): ConfigurationResponse {
    return Object.assign({}, response, {
        outputList: response.outputList.map(output => Object.assign({}, output, {
            configured: Object.assign({}, output.configured, {
                sampleType: parseInt(SampleType[output.configured.sampleType as any])
            })
        }))
    })
}

function toWireConfiguration(config: Configuration): WireConfiguration {
    return config.parameterValues == null
        ? {channelCount: config.channelCount, framing: config.framing}
        : Object.assign({}, config, {
        parameterValues: [...config.parameterValues.entries()]
            .reduce((obj, pair) => Object.assign(obj, {[pair[0]]: pair[1]}), {})
    });
}

function toConfiguration(config: WireConfiguration): Configuration {
    return config.parameterValues == null
        ? {channelCount: config.channelCount, framing: config.framing}
        : Object.assign({}, config, {
        parameterValues: new Map(Object.keys(config.parameterValues).map(key => [key, config.parameterValues[key]]) as any)
    });
}

function toWireProcessRequest(request: ProcessRequest, asBase64?: boolean): WireProcessRequest {
    const nChannels: number = request.processInput.inputBuffers.length;
    const inputBuffers: string[] | number[][] =
        new Array(nChannels);
    if (asBase64) {
        for (let i = 0; i < nChannels; ++i)
            inputBuffers[i] = toBase64(request.processInput.inputBuffers[i]);
    } else {
        for (let i = 0; i < nChannels; ++i)
            inputBuffers[i] = Array.from(request.processInput.inputBuffers[i]);
    }
    return {
        handle: request.handle,
        processInput: {
            timestamp: request.processInput.timestamp,
            inputBuffers: inputBuffers
        }
    }
}

function toProcessRequest(request: WireProcessRequest): ProcessRequest {
    const hasBase64InputBuffer: boolean =
        typeof request.processInput.inputBuffers[0] === "string";
    const nChannels: number = request.processInput.inputBuffers.length;
    let inputBuffers: Float32Array[] = new Array(nChannels);
    const wireBuffers: string[] | number[][] = request.processInput.inputBuffers;
    if (hasBase64InputBuffer) {
        for (let i = 0; i < nChannels; ++i)
            inputBuffers[i] = fromBase64((wireBuffers as string[])[i]);
    } else {
        for (let i = 0; i < nChannels; ++i)
            inputBuffers[i] = new Float32Array((wireBuffers as number[][])[i]);
    }
    return {
        handle: request.handle,
        processInput: {
            timestamp: request.processInput.timestamp,
            inputBuffers: inputBuffers
        }
    };
}

function toWireProcessResponse(response: ProcessResponse, asBase64: boolean): WireProcessResponse {
    let wireFeatureSet: WireFeatureSet = {};
    const keys: string[] = Array.from(response.features.keys());

    for (let i = 0, nKeys = keys.length; i < nKeys; ++i) {
        const featureList: FeatureList = response.features.get(keys[i]);
        const nFeatures: number = featureList.length;
        wireFeatureSet[keys[i]] = new Array(nFeatures);
        const wireFeatureList = wireFeatureSet[keys[i]];
        for (let j = 0; j < nFeatures; ++j) {
            const feature: Feature = featureList[j];
            const hasFeatureValues = response.features != null &&
                feature.featureValues != null;

            let wireFeature: WireFeature = {};
            if (hasFeatureValues) {
                if (asBase64) {
                    wireFeature = {
                        featureValues: toBase64(feature.featureValues)
                    };
                } else {
                    wireFeature =  {
                        featureValues: Array.from(feature.featureValues)
                    }
                }
            }
            wireFeatureList[j] = Object.assign({}, feature, wireFeature);
        }
    }
    return {
        handle: response.handle,
        features: wireFeatureSet
    };
}

function toProcessResponse(response: WireProcessResponse): ProcessResponse {
    const features: FeatureSet = new Map();
    const wireFeatures: WireFeatureSet = response.features;
    const keys: string[] = Object.keys(wireFeatures);
    for (let i = 0, nKeys = keys.length; i < nKeys; ++i)
        features.set(keys[i], convertWireFeatureList(wireFeatures[keys[i]]))
    return {
        handle: response.handle,
        features: features
    };
}

function convertWireFeatureList(wfeatures: WireFeatureList): FeatureList {
    const nFeatures: number = wfeatures.length;
    let features: FeatureList = new Array(nFeatures);
    for (let i = 0; i < nFeatures; ++i)
        features[i] = convertWireFeature(wfeatures[i]);
    return features;
}

function convertWireFeature(wfeature: WireFeature): Feature {
    let out: Feature = {};
    if (wfeature.timestamp != null) {
        out.timestamp = wfeature.timestamp;
    }
    if (wfeature.duration != null) {
        out.duration = wfeature.duration;
    }
    if (wfeature.label != null) {
        out.label = wfeature.label;
    }
    const vv = wfeature.featureValues;
    if (vv != null) {
        if (typeof vv === "string") {
            out.featureValues = fromBase64(vv);
        } else {
            out.featureValues = new Float32Array(vv);
        }
    }
    return out;
}

function toBase64(values: Float32Array): string {
    // We want a base-64 encoding of the raw memory backing the
    // typed array. We assume byte order will be the same when the
    // base-64 stuff is decoded, but I guess that might not be
    // true in a network situation. The Float32Array docs say "If
    // control over byte order is needed, use DataView instead" so
    // I guess that's a !!! todo item
    return base64.fromByteArray(
        new Uint8Array(
            values.buffer,
            values.byteOffset,
            values.byteLength
        )
    );
}

function fromBase64(b64: string): Float32Array {
    // The base64 module expects input to be padded to a
    // 4-character boundary, but the C++ VampJson code does not do
    // that, so let's do it here
    while (b64.length % 4 > 0) {
        b64 += "=";
    }
    // !!! endianness, as above.
    return new Float32Array(base64.toByteArray(b64).buffer);
}
