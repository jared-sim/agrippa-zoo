import { BACKEND_URL } from './Api';
import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import './Model.css';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';


function Model(){

    const [modelInfo, setModelInfo] = useState({});
    const [modelLoadFailed, setModelLoadFailed] = useState(false);
    const [modelLoaded, setModelLoaded] = useState(false);

    const [modelReadme, setModelReadme] = useState("");
    const [modelReadmeLoadFailed, setModelReadmeLoadFailed] = useState(false);
    const [modelReadmeLoaded, setModelReadmeLoaded] = useState(false);

    let { id } = useParams();

    useEffect(() => {

        async function getModel(){
            console.log("Getting jawn")
            let url = BACKEND_URL + "info/model?id=" + id;
            try {
                const response = await fetch(url);
                const myJson = await response.json(); //extract JSON from the http response
            
                setModelInfo(myJson);
                setModelLoaded(true);
            } 
            catch (error) {
                console.error(error);
                setModelLoadFailed(true);
            }
        }
        async function getReadme(){
            let url = BACKEND_URL + "download/readme?id=" + id;
            try {
                const response = await fetch(url);
                const myStr = await response.text();
            
                setModelReadmeLoaded(true);
                setModelReadme(myStr);
            } 
            catch (error) {
                console.error(error);
                setModelReadmeLoadFailed(true);
            }
        }
        getModel();
        getReadme();

    }, [id])

    if (modelLoaded === false && modelLoadFailed === false){
        return (
            <div>Loading model...</div>
        )
    }
    else if (modelLoadFailed === true){
        return (
            <div>Model failed to load. Try again.</div>
        )
    }
    else{
        let model_name = modelInfo['name'];
        let model_author = modelInfo['author_name'];
        let short_desc = modelInfo['short_desc'];
        let canonical = modelInfo['canonical'];
        let tags = JSON.parse(modelInfo['tags']);
        let md_text = modelReadme;

        let readme_header = "";

        let canon = ""
        if (canonical){
            canon = (
                <div className='canonical'>Canonical</div>
            );
        }

        let tag_arr = []
        // Go through the tags, make it an array that can be passed like model squares is
        for (const [key, value] of Object.entries(tags)) {
            tag_arr.push([key, value])
        }

        // if we're waiting for it to load or it's loaded
        if(modelReadmeLoaded && md_text !== "" && modelReadmeLoadFailed !== true){
            readme_header = (
                <div>
                    <div className='readme-header'>README.md</div>
                    <br/><br/>
                </div>
            );
        }

        function makeTag(item){
            return (
                <span key={item} className="tag">{item}</span>
            );
        }

        function makeTagGroup(item){
            const listTags = item[1].map(makeTag);
            return (
                <div className='tag-group' key={item[0]}>
                    <div className='tag-group-name'>{item[0]}</div>
                    {listTags}
                </div>
            );
        }
        
        const listTagGroups = tag_arr.map(makeTagGroup);
        return (
            <div className='content-container'>
                <div className='model_card'>
                    <h1 className='model_name'>
                        {model_name}
                    </h1>
                    {canon}

                    <div>
                        <span className='author'>Author: </span>{model_author}
                    </div>
                    <div className='download-block'>
                        <a href={BACKEND_URL + "download/markup?download=1&id=" + id} download={true}>
                            <span className='download-text'>Download Markup</span>
                        </a>
                    </div>
                    <div className='download-block'>
                        <Link to={"/workspace/" + id}><span className='download-text'>View in Workspace</span></Link>
                    </div>
                    <div className='short_desc'>{short_desc}</div>
                    {listTagGroups}
                    {readme_header}
                    <ReactMarkdown>
                        {md_text}
                    </ReactMarkdown>
                </div>
            </div>
        )
    }

}

export default Model;