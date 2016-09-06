/**
 * Created by lucas on 02/09/2016.
 */
import chai = require('chai');
import chaiAsPromised = require('chai-as-promised');
chai.should();
chai.use(chaiAsPromised);
import {Feature} from '../src/Feature';
import {ZeroCrossings} from "../src/ZeroCrossings";
import {ProcessBlock} from '../src/PluginServer';
import {batchProcess, FrameCutter} from '../src/AudioUtilities'
import {FeatureExtractor} from "../src/FeatureExtractor";

describe('BatchBlockProcess', () => {
    it('should aggregate features extracted from multiple blocks', () => {
        const expectedFeatures: Feature[][] = [];
        expectedFeatures.push([{values: [5]} as Feature]);
        expectedFeatures.push([{values: [6]} as Feature]);

        const blocks: ProcessBlock[] = [];

        blocks.push({
            timestamp: {s: 0, n: 0},
            inputBuffers: [{values: new Float32Array([0, 1, -1, 0, 1, -1, 0, 1])}]
        });

        blocks.push({
            timestamp: {s: 0, n: 500000000},
            inputBuffers: [{values: new Float32Array([0, 1, -1, 0, 1, -1, 0, 1])}]
        });

        const zc: FeatureExtractor = new ZeroCrossings();
        const features: Promise<Feature[][]> = batchProcess(blocks, (block) => zc.process(block));
        return features.should.eventually.deep.equal(expectedFeatures);
    });
});

describe('FrameCutter', () => {
    const blockSize: number = 8;
    const stepSize: number = 4;
    const nBlocks: number = 4;
    const audioData: Float32Array = new Float32Array(nBlocks * blockSize);
    const fillBlocksWithConsecutiveIntegers = (audioData: Float32Array) => {
        for (let nBlock = 1; nBlock < nBlocks; ++nBlock)
            audioData.fill(nBlock, nBlock * blockSize, (nBlock * blockSize) + blockSize);
    };

    fillBlocksWithConsecutiveIntegers(audioData);
    let cutter: IterableIterator<Float32Array>;

    beforeEach('reset cutter', () => {
        cutter = new FrameCutter(blockSize, stepSize, audioData)
    });

    it('Should zero pad the block when there are no more samples', () => {
        cutter = new FrameCutter(blockSize, stepSize, new Float32Array(0));
        cutter.next().value.should.deep.equal(new Float32Array(blockSize));
    });

    it('Can be used as an iterator', () => {
        cutter.next().value.should.deep.equal(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]));
        cutter.next().value.should.deep.equal(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]));
        cutter.next().value.should.deep.equal(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]));
        cutter.next().value.should.deep.equal(new Float32Array([1, 1, 1, 1, 2, 2, 2, 2]));
        cutter.next().value.should.deep.equal(new Float32Array([2, 2, 2, 2, 2, 2, 2, 2]));
        cutter.next().value.should.deep.equal(new Float32Array([2, 2, 2, 2, 3, 3, 3, 3]));
        cutter.next().value.should.deep.equal(new Float32Array([3, 3, 3, 3, 3, 3, 3, 3]));
        cutter.next().value.should.deep.equal(new Float32Array([3, 3, 3, 3, 0, 0, 0, 0]));
        cutter.next().done.should.be.true;
    });

    it('Can be looped over', () => {
        const expectedBlocks: number[][] = [
            [ 0, 0, 0, 0, 0, 0, 0, 0 ],
            [ 0, 0, 0, 0, 1, 1, 1, 1 ],
            [ 1, 1, 1, 1, 1, 1, 1, 1 ],
            [ 1, 1, 1, 1, 2, 2, 2, 2 ],
            [ 2, 2, 2, 2, 2, 2, 2, 2 ],
            [ 2, 2, 2, 2, 3, 3, 3, 3 ],
            [ 3, 3, 3, 3, 3, 3, 3, 3 ],
            [ 3, 3, 3, 3, 0, 0, 0, 0 ]
        ];
        let i = 0;
        for (let block of cutter)
            Array.from(block).should.deep.equal(expectedBlocks[i++]);
    });
});