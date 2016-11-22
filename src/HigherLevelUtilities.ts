/**
 * Created by lucas on 07/11/2016.
 */
import {
    Parameters, OutputIdentifier, FeatureExtractor, Configuration,
    ConfiguredOutputs, ConfiguredOutputDescriptor,
    SampleType, ProcessInput, AdapterFlags
} from "./FeatureExtractor";
import {Feature, FeatureSet, FeatureList} from "./Feature";
import {fromFrames} from "./Timestamp";
import {
    FeatureTimeAdjuster,
    createFeatureTimeAdjuster
} from "./FeatureTimeAdjuster";
import {
    ListRequest, ListResponse, Service, LoadResponse,
    ExtractorHandle
} from "./Piper";
import {PiperClient} from "./PiperClient";
import {batchProcess} from "../test/AudioUtilities";

export type AudioData = Float32Array[];
export type Output = {[key: string]: Feature}; // TODO rename / re-think
export type FramedAudio = IterableIterator<AudioData>;

export interface AudioStreamFormat {
    channelCount: number;
    sampleRate: number;
}

export interface AudioStream {
    frames: FramedAudio;
    format: AudioStreamFormat;
}

export type FeatureCollectionShape = "matrix" | "vector" | "list";
// TODO consider revising
export interface FeatureCollection {
    shape: FeatureCollectionShape;
    data: FeatureList | Float32Array | Float32Array[];
}

export interface FixedSpacedFeatures extends FeatureCollection {
    stepDuration: number;
}
export type KeyValueObject = {[key: string]: any};
export type CreateFeatureExtractorFunction = (sampleRate: number,
                                       key: string,
                                       additionalArgs?: KeyValueObject) => FeatureExtractor;

// TODO should format be passed in or derived by the callback?
// TODO does this even make any sense? This only exists because the extractor can inform the buffer size, so one might want to stream at that size
export type CreateAudioStreamFunction = (blockSize: number,
                                         stepSize: number,
                                         format: AudioStreamFormat,
                                         additionalArgs?: KeyValueObject) => AudioStream;


export interface SimpleRequest {
    audioData: AudioData;
    audioFormat: AudioStreamFormat;
    key: string;
    outputId?: OutputIdentifier;
    parameterValues?: Parameters;
    stepSize?: number;
    blockSize?: number;
}

export interface SimpleService {
    list(request: ListRequest): Promise<ListResponse>;
    process(request: SimpleRequest): Promise<FeatureList>;
    collect(request: SimpleRequest): Promise<FeatureCollection>;
}

export function* segment(blockSize: number,
                         stepSize: number,
                         audioData: AudioData): IterableIterator<AudioData> {
    let nStep: number = 0;
    const nSteps: number = audioData[0].length / stepSize;
    while (nStep < nSteps) {
        const start: number = nStep++ * stepSize;
        const stop: number = start + blockSize;
        yield audioData.map(channelData => {
            const block = channelData.subarray(start, stop);
            return block.length === blockSize
                ? channelData.subarray(start, stop)
                : Float32Array.of(...block, ...new Float32Array(blockSize - block.length));
        })
    }
}

interface OptionalConfiguration {
    channelCount?: number;
    blockSize?: number;
    stepSize?: number;
    parameterValues?: Parameters;
}

function determineConfiguration(defaultConfig: Configuration,
                                overrides?: OptionalConfiguration): Configuration {
    let blockSize: number = overrides.blockSize || defaultConfig.blockSize || 1024;
    let stepSize: number = overrides.stepSize || defaultConfig.stepSize || blockSize;
    let channelCount: number = overrides.channelCount || defaultConfig.channelCount || 1; // TODO is 1 okay?

    let config: Configuration = {
        channelCount: channelCount,
        blockSize: blockSize,
        stepSize: stepSize
    };

    if (overrides.parameterValues && overrides.parameterValues.size > 0)
        config["parameterValues"] = overrides.parameterValues;

    return config;
}

function loadAndConfigure(extractor: FeatureExtractor,
                          defaultConfig: Configuration,
                          channelCount: number,
                          params: Parameters = new Map(),
                          args: KeyValueObject = {}): [Configuration, ConfiguredOutputs] {

    const config = determineConfiguration(defaultConfig, {
        blockSize: (args)["blockSize"],
        stepSize: (args)["stepSize"],
        channelCount: channelCount,
        parameterValues: params
    });

    return [config, extractor.configure(config)];
}

export function* processConfiguredExtractor(frames: FramedAudio,
                                            sampleRate: number,
                                            stepSize: number,
                                            extractor: FeatureExtractor,
                                            outputs: OutputIdentifier[]): IterableIterator<Output> {
    let nFrame: number = 0;
    const lazyOutput = function* (features: FeatureSet) {
        for (let output of outputs) {
            if (features.has(output))
                for (let feature of features.get(output))
                    yield {[output]: feature};
        }
    };

    for (let frame of frames) {
        const features: FeatureSet = extractor.process({
            timestamp: fromFrames(nFrame, sampleRate),
            inputBuffers: frame
        });

        for (let output of lazyOutput(features))
            yield output;

        nFrame += stepSize;
    }

    for (let output of lazyOutput(extractor.finish()))
        yield output;
}

function deduceShape(descriptor: ConfiguredOutputDescriptor): FeatureCollectionShape {
    const isList = descriptor.hasDuration
        || descriptor.sampleType === SampleType.VariableSampleRate
        || !descriptor.binCount;
    const isVector = descriptor.binCount === 1;
    if (isList) return "list";
    if (isVector) return "vector";
    return "matrix";
}

function reshape(outputs: Iterable<Output>,
                 id: OutputIdentifier,
                 stepDuration: number,
                 descriptor: ConfiguredOutputDescriptor,
                 adjustTimestamps: boolean = true): FeatureCollection | FixedSpacedFeatures {
    const shape: FeatureCollectionShape = deduceShape(descriptor);
    const adjuster: FeatureTimeAdjuster = createFeatureTimeAdjuster(descriptor, stepDuration);

    // TODO switch suggests that matrix and list could be types, dynamically dispatch to a .data() method or similar
    // TODO adjust timestamps for vector and matrix
    switch(shape) {
        case "vector":
            return {
                shape: shape,
                stepDuration: stepDuration,
                data: new Float32Array([...outputs].map(output => output[id].featureValues[0]))
            };
        case "matrix":
            return {
                shape: shape,
                stepDuration: stepDuration,
                data: [...outputs].map(output => new Float32Array(output[id].featureValues))
            };
        case "list":
            return {
                shape: shape,
                data: [...outputs].map(output => {
                    const feature: Feature = output[id];
                    if (adjustTimestamps)
                        adjuster.adjust(feature);
                    return feature;
                })
            };
        default:
            throw new Error("A valid shape could not be deduced.");
    }
}

function getFeatureStepDuration(sampleRate: number,
                                stepSize: number,
                                descriptor: ConfiguredOutputDescriptor) {
    switch (descriptor.sampleType) {
        case SampleType.OneSamplePerStep:
            return stepSize / sampleRate;
        case SampleType.FixedSampleRate:
            return 1.0 / descriptor.sampleRate;
        default:
            return 1.0;
    }
}

// TODO revise "factories"
export function collect(createAudioStreamCallback: CreateAudioStreamFunction,
                        streamFormat: AudioStreamFormat,
                        createFeatureExtractorCallback: CreateFeatureExtractorFunction,
                        extractorKey: string,
                        outputId?: OutputIdentifier,
                        params?: Parameters,
                        args: KeyValueObject = {}): FeatureCollection {
    // TODO reduce duplication with process - only issue stopping calling process directly here for lazyOutputs is that ConfiguredOutputs and Configuration are needed
    const extractor = createFeatureExtractorCallback(
        streamFormat.sampleRate,
        extractorKey
    );

    const [config, outputs] = loadAndConfigure(
        extractor,
        extractor.getDefaultConfiguration(),
        streamFormat.channelCount,
        params,
        args
    );

    const stream: AudioStream = createAudioStreamCallback(
        config.blockSize,
        config.stepSize,
        streamFormat
    );
    outputId = outputId ? outputId : outputs.keys().next().value;

    if (!outputs.has(outputId)) throw Error("Invalid output identifier.");

    const descriptor: ConfiguredOutputDescriptor = outputs.get(outputId);
    const lazyOutputs = processConfiguredExtractor(
        stream.frames,
        stream.format.sampleRate,
        config.stepSize,
        extractor,
        [outputId]
    );
    return reshape(
        lazyOutputs,
        outputId,
        getFeatureStepDuration(stream.format.sampleRate, config.stepSize, descriptor),
        descriptor
    );
}

export function* process(createAudioStreamCallback: CreateAudioStreamFunction,
                         streamFormat: AudioStreamFormat,
                         createFeatureExtractorCallback: CreateFeatureExtractorFunction,
                         extractorKey: string,
                         outputId?: OutputIdentifier,
                         params?: Parameters,
                         args: KeyValueObject = {}): IterableIterator<Feature> {
    // TODO needs wrapping to handle input domain, channel and buffer adapter?
    // this is going to happen automatically in piper-vamp / emscripten extractors - Perhaps it should happen in the factory
    const extractor = createFeatureExtractorCallback(
        streamFormat.sampleRate,
        extractorKey
    );

    const [config, outputs] = loadAndConfigure(
        extractor,
        extractor.getDefaultConfiguration(),
        streamFormat.channelCount,
        params,
        args
    );

    const stream: AudioStream = createAudioStreamCallback(
        config.blockSize,
        config.stepSize,
        streamFormat
    );
    outputId = outputId ? outputId : outputs.keys().next().value;
    const descriptor: ConfiguredOutputDescriptor = outputs.get(outputId);
    const lazyOutputs = processConfiguredExtractor(
        stream.frames,
        stream.format.sampleRate,
        config.stepSize,
        extractor,
        [outputId]
    );

    const adjuster: FeatureTimeAdjuster = createFeatureTimeAdjuster(
        descriptor,
        getFeatureStepDuration(stream.format.sampleRate, config.stepSize, descriptor)
    );

    for (let output of lazyOutputs) {
        adjuster.adjust(output[outputId]);
        yield output[outputId];
    }
}



interface CustomConfigurationResponse {
    handle: ExtractorHandle;
    blocks: IterableIterator<ProcessInput>;
    outputId: string;
    configuredOutputDescriptor: ConfiguredOutputDescriptor;
}

export class PiperSimpleClient implements SimpleService {
    private client: Service;

    constructor(service: Service) {
        this.client = new PiperClient(service);
    }

    list(request: ListRequest): Promise<ListResponse> {
        return this.client.list(request);
    }

    // TODO could this be a generator?
    process(request: SimpleRequest): Promise<FeatureList> {
        // TODO come up with a mechanism for pipelining requests to reduce client-server round-trips
        return this.client.list({}) // TODO is the list really necessary? - prevents doing any processing if the extractor / output is not available
            .then(this.load(request))
            .then(this.configure(request))
            .then(this.processAndFinish);
    }

    collect(request: SimpleRequest): Promise<FeatureCollection> {

        const processFinishReshape = (response: CustomConfigurationResponse): Promise<FeatureCollection> => {
            return this.processAndFinish(response)
                .then(features => {
                    // TODO refactor parts of reshape so additional reshaping isn't required here
                    return reshape(
                        features.map(feature => {
                            return {
                                [response.outputId]: feature
                            }
                        }), // map FeatureList to {outputId: Feature}[]
                        response.outputId,
                        getFeatureStepDuration(
                            request.audioFormat.sampleRate,
                            request.stepSize,
                            response.configuredOutputDescriptor
                        ),
                        response.configuredOutputDescriptor,
                        false
                    );
                });
        };

        return this.client.list({})
            .then(this.load(request))
            .then(this.configure(request))
            .then(processFinishReshape)
    }

    // TODO sort this shit out

    private load = (request: SimpleRequest) => (response: ListResponse): Promise<LoadResponse> => {
        const metadata = response.available.filter(metadata => metadata.key === request.key);
        if (metadata.length !== 1) throw Error("Invalid key.");

        return this.client.load({
            key: request.key,
            inputSampleRate: request.audioFormat.sampleRate,
            adapterFlags: [AdapterFlags.AdaptAllSafe]
        });
    };

    private configure = (request: SimpleRequest) => (res: LoadResponse): Promise<CustomConfigurationResponse> => {
        const config = determineConfiguration(
            res.defaultConfiguration,
            {
                blockSize: request.blockSize,
                stepSize: request.stepSize,
                channelCount: request.audioFormat.channelCount,
                parameterValues: request.parameterValues
            }
        );

        // TODO refactor parts of processConfiguredExtractor for use here / reduce dup
        const toProcessInputStream = function* (stream: AudioStream): IterableIterator<ProcessInput> {
            let nFrame: number = 0;
            for (let frame of stream.frames) {
                yield {
                    timestamp: fromFrames(nFrame, stream.format.sampleRate),
                    inputBuffers: frame
                };
                nFrame += config.stepSize;
            }
        };

        return this.client.configure({
            handle: res.handle,
            configuration: config
        }).then(res => {
            const outputId = request.outputId
                ? request.outputId
                : res.outputList[0].basic.identifier;

            if (res.outputList.filter(output => output.basic.identifier === outputId).length === 0)
                throw Error("Invalid output identifier.");

            return {
                handle: res.handle,
                blocks: toProcessInputStream({
                    frames: segment(config.blockSize, config.stepSize, request.audioData),
                    format: request.audioFormat
                }),
                outputId: outputId,
                configuredOutputDescriptor: res.outputList.find(output => output.basic.identifier === outputId).configured
            }
        });
    };

    private processAndFinish = (res: CustomConfigurationResponse): Promise<FeatureList> => {
        // TODO implement something better than batchProcess?
        return batchProcess(
            res.blocks,
            (block) => this.client.process({
                handle: res.handle,
                processInput: block
            }).then(response => response.features),
            () => this.client.finish({handle: res.handle}).then(res => res.features)
        ).then(featureSet => {
            return featureSet.get(res.outputId)
        });
    };
}