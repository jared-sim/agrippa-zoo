import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './Flow.css';
import dagre from 'dagre';

const initialNodes = [];

const initialEdges = [{ id: 'e1-2', source: '1', target: '2' }, { id: 'e2-3', source: '0', target: '1' }];
// const initialEdges = [];

const exampleFileText = `
<model script-version="0.0.1">

    <!-- Uses default type, which is float32 -->
    <!-- For tokens: each row is a one hot vector, sequence proceeds vertically in the matrix -->

    <import from="tokens" dim="[var(ntokens), var(nvocab)]" />
    <import from="mask" dim="[var(ntokens), var(ntokens)]" />
    <import from="posembedmatrix" dim="[var(ntokens), var(dmodel)]" />
    <import from="Embed" dim="[var(nvocab), var(dmodel)]" />
    <import from="encoder_output" dim="[var(ntokens), var(dmodel)]" />

    <!-- Shrinks tokens into dmodel using a learned embedding -->
    <block title="Embedding">
        <import from="Embed" />
        <node op="Mul" title="EmbedMul">
            <input src="Embed" />
            <params dim="[1]" name="embeddings_scale" init="constant" init_args="[var(embed_scale)]" frozen="yes" />
            <output name="embed_scaled" />
        </node>
        <node op="MatMul" title="EmbedProjection">
            <input src="tokens" />
            <input src="embed_scaled" />
            <output name="embeddings" />
        </node>
        <export from="embeddings" dim="[var(ntokens), var(dmodel)]" />
    </block>

    <block title="PositionalEmbedding">
        <import from="embeddings" />
        <import from="posembedmatrix" />
        <node op="Add">
            <input src="embeddings" />
            <input src="posembedmatrix" />
            <output name="posembeddings" />
        </node>
        <export from="posembeddings" dim="[var(ntokens), var(dmodel)]" />
    </block>

    <!-- The big decoder block -->
    <block title="DecoderLayer" rep="var(nlayers)">
        <import from="posembeddings" dim="[var(ntokens), var(dmodel)]" />

        <block title="Attention" stretch="var(nheads)">
            <import from="posembeddings" dim="[var(ntokens), var(dmodel)]" />
            <import from="mask" dim="[var(ntokens), var(ntokens)]" />
            <block title="LinearQKV">
                <import from="posembeddings" />
                <node op="MatMul">
                    <input src="posembeddings" />
                    <params name="QueryWeights" dim="[var(dmodel), var(dqueries)]" />
                    <output name="queries" dims="[var(ntokens), var(dqueries)]" />
                </node>
                <node op="MatMul">
                    <input src="posembeddings" />
                    <params name="KeyWeights" dim="[var(dmodel), var(dkeys)]" />
                    <output name="keys" dims="[var(ntokens), var(dkeys)]" />
                </node>
                <node op="MatMul">
                    <input src="posembeddings" />
                    <params name="ValueWeights" dim="[var(dmodel), var(dvalues)]" />
                    <output name="values" dim="[var(ntokens), var(dvalues)]" />
                </node>
                <export from="queries" />
                <export from="keys" />
                <export from="values" />
            </block>
            <block title="ScaledDotProductAttention">
                <import from="mask" dim="[var(ntokens), var(ntokens)]" />
                <import from="queries" />
                <import from="values" />
                <import from="keys" />
                <node op="Transpose">
                    <input src="keys" />
                    <output name="keys_t" dim="[var(dkeys), var(ntokens)]" />
                </node>
                <node op="MatMul">
                    <input src="queries" />
                    <input src="keys_t" />
                    <output name="matmul" dim="[var(ntokens), var(ntokens)]" />
                </node>
                <node op="Div">
                    <input src="matmul" />
                    <params name="scale" frozen="yes" dim="[1]" init="constant" init_args="[var(scale)]" />
                    <output name="scaled" />
                </node>
                <node title="Mask" op="Add">
                    <input src="scaled" />
                    <input src="mask" />
                    <output name="masked" />
                </node>
                <node op="Softmax" axis="-1">
                    <input src="masked" />
                    <output name="softmaxed" />
                </node>
                <node op="MatMul" title="ValueMatmul">
                    <input src="softmaxed" />
                    <input src="values" />
                    <output name="attended" dim="[var(ntokens), var(dvalues)]" />
                </node>
            </block>            
            <export from="attended" />
        </block>

        <block title="ConcatLinear">
            <import from="attended" />
            <node op="MatMul">
                <input src="attended" />
                <params name="LinearConcatW" dim="[expr(dvalues * nheads), var(dmodel)]" />
                <output name="linear_concatenated" />
            </node>
            <export from="linear_concatenated" />
        </block>
        
        <block title="Add">
            <import from="linear_concatenated" />
            <import from="posembeddings" />
            <node op="Add">
                <input src="linear_concatenated" />
                <input src="posembeddings" />
                <output name="attended_added" />
            </node>
            <export from="attended_added" />
        </block>

        <node name="LN1_Placeholder" op="Identity">
            <input src="attended_added" />
            <output name="ln1$input" />
        </node>
        <block src="layer_norm.agr" name="ln1" />

        <block title="FFN">
            <import from="ln1$layer_norm_out" />
            <node op="MatMul">
                <input src="ln1$layer_norm_out" />
                <params name="ffn_w" dim="[var(dmodel), var(dffnhidden)]" />
                <output name="ffn_projected" dim="[var(ntokens), var(dffnhidden)]" />
            </node>
            <node op="Add" title="FFNBiases" >
                <input src="ffn_projected" />
                <!-- Note that the biases are numpy style broadcasted,
                        so the FFN remains identical for each position -->
                <params name="ffn_b" dim="[var(dffnhidden)]" init="zeros" />
                <output name="ffn_biased" />
            </node>
            <node op="Relu">
                <input src="ffn_biased" />
                <output name="ffn_relu" />
            </node>
            <node op="MatMul">
                <input src="ffn_relu" />
                <params name="ffn_w2" dim="[var(dffnhidden), var(dmodel)]" />
                <output name="ffn_second_proj" />
            </node>
            <node op="Add" title="FFNBiases2">
                <input src="ffn_second_proj" />
                <params name="ffn_b2" dim="[var(dmodel)]" init="zeros" />
                <output name="ffn_out" />
            </node>
            <export from="ffn_out" />
        </block>

        <block title="Add2">
            <import from="ffn_out" />
            <import from="ln1$layer_norm_out" />
            <node op="Add">
                <input src="ffn_out" />
                <input src="ln1$layer_norm_out" />
                <output name="attended_added2" />
            </node>
            <export from="attended_added2" />
        </block>

        <node name="LN2_Placeholder" op="Identity">
            <input src="attended_added" />
            <output name="ln2$input" />
        </node>
        <block src="layer_norm.agr" name="ln2" />

        <!-- Queries come from prev layer, keys and values come from encoder -->
        <block title="CrossAttention" stretch="var(nheads)">
            <import from="ln2$layer_norm_out" dim="[var(ntokens), var(dmodel)]" />
            <import from="encoder_output" dim="[var(ntokens), var(dmodel)]" />
            <block title="LinearQKV">
                <import from="ln2$layer_norm_out" />
                <node op="MatMul">
                    <input src="ln2$layer_norm_out" />
                    <params name="QueryWeights2" dim="[var(dmodel), var(dqueries)]" />
                    <output name="queries2" dims="[var(ntokens), var(dqueries)]" />
                </node>
                <node op="MatMul">
                    <input src="encoder_output" />
                    <params name="KeyWeights2" dim="[var(dmodel), var(dkeys)]" />
                    <output name="keys2" dims="[var(ntokens), var(dkeys)]" />
                </node>
                <node op="MatMul">
                    <input src="encoder_output" />
                    <params name="ValueWeights2" dim="[var(dmodel), var(dvalues)]" />
                    <output name="values2" dim="[var(ntokens), var(dvalues)]" />
                </node>
                <export from="queries2" />
                <export from="keys2" />
                <export from="values2" />
            </block>
            <block title="ScaledDotProductAttention">
                <import from="queries2" />
                <import from="values2" />
                <import from="keys2" />
                <node op="Transpose">
                    <input src="keys2" />
                    <output name="keys_t2" dim="[var(dkeys), var(ntokens)]" />
                </node>
                <node op="MatMul">
                    <input src="queries2" />
                    <input src="keys_t2" />
                    <output name="matmul2" dim="[var(ntokens), var(ntokens)]" />
                </node>
                <node op="Div">
                    <input src="matmul2" />
                    <params name="scale2" frozen="yes" dim="[1]" init="constant" init_args="[var(scale)]" />
                    <output name="scaled2" />
                </node>
                <node op="Softmax" axis="-1">
                    <input src="scaled2" />
                    <output name="softmaxed2" />
                </node>
                <node op="MatMul" title="ValueMatmul">
                    <input src="softmaxed2" />
                    <input src="values2" />
                    <output name="attended2" dim="[var(ntokens), var(dvalues)]" />
                </node>
            </block>            
            <export from="attended2" />
        </block>

        <block title="ConcatLinear">
            <import from="attended2" />
            <node op="MatMul">
                <input src="attended2" />
                <params name="LinearConcatW2" dim="[expr(dvalues * nheads), var(dmodel)]" />
                <output name="linear_concatenated2" />
            </node>
            <export from="linear_concatenated2" />
        </block>

        <block title="Add2">
            <import from="linear_concatenated2" />
            <import from="ln2$layer_norm_out" />
            <node op="Add">
                <input src="linear_concatenated2" />
                <input src="ln2$layer_norm_out" />
                <output name="attended2_added" />
            </node>
            <export from="attended2_added" />
        </block>

        <node name="LN3_Placeholder" op="Identity">
            <input src="attended2_added" />
            <output name="ln3$input" />
        </node>
        <block src="layer_norm.agr" name="ln3" />

        <export from="ln3$layer_norm_out" />
    </block>

    <export from="ln3$layer_norm_out" dim="[var(ntokens), var(nvocab)]" />
</model>
`

function Flow(props) {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [fileText] = useState(exampleFileText);


    useEffect(() => {

        function makeNodeFromTag(el, id) {
            //let rootChildren = el.children;
            let attrs = el.attributes;
            let title = `Untitled ${el.nodeName}`;
            if (attrs['title']){
                title = attrs['title'].value;
            }

            return { id: id+"", position: { x: 0, y: 0 }, data: { label: title }, el: el }
        }

        // xmlDoc is a "Document" received from parser.parseFromString
        function getNodesFromXMLObj(modelDoc) {
    
            let rootChildren = modelDoc.children;
            let newNodes = []
            let k = 0;
            for (let i = 0; i < rootChildren.length; i++){
                if (rootChildren[i].nodeName === 'block' || rootChildren[i].nodeName === 'node'){
                    newNodes.push(makeNodeFromTag(rootChildren[i], k));
                    k++;
                }
            }
            return newNodes;
        }

        function arrangeNodes(nodes){
            let g = new dagre.graphlib.Graph();
            g.setGraph({});
            g.setDefaultEdgeLabel(function() { return {}; });
            for (let i = 0; i < nodes.length; i++){
                // 150 and 50 are literally just heuristics; I had a hard time figuring out how to retrieve height/width data
                g.setNode(nodes[i].id, {width: 150, height: 50});
            }
    
            for (let i = 0; i < edges.length; i++){
                g.setEdge(edges[i].source, edges[i].target);
            }
    
            dagre.layout(g);
    
            let arrangedNodes = [];
            for (let i = 0; i < nodes.length; i++){
                let newNode = Object.assign({}, nodes[i]);
                newNode.position.x = g.node(newNode.id).x;
                newNode.position.y = g.node(newNode.id).y;
                arrangedNodes.push(newNode);
            }
            return arrangedNodes;
        }

        let parser = new DOMParser();
        let xmlDoc = parser.parseFromString(fileText, "text/xml");

        let modelDoc = xmlDoc.documentElement;

        let newNodes = getNodesFromXMLObj(modelDoc);
        newNodes = arrangeNodes(newNodes);
        console.log(newNodes)
        setNodes(newNodes);
    }, [fileText, setNodes, edges])

    function onNodeClick(event, node){
        console.log(node.el);
    }

    return (
        <div style={{ width:'100%', height: '100%', display: 'flex'}}>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
            >
                <Controls />
                <Background />
            </ReactFlow>
            <div id='menu'>
                <h2>
                    Details
                </h2>
            </div>
        </div>
    );
}

export default Flow;