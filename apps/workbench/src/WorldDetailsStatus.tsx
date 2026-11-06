import React from 'react';
import type {usePublicationDetails} from './use-publication-details';

export function WorldDetailsStatus({details}:{details:ReturnType<typeof usePublicationDetails>}){
 if(details.error)return <p role="status" className="feature-status warning">{details.error} Current JSON values remain available. <button onClick={details.retry}>Retry loading saved details</button></p>;
 return details.loading?<p role="status">Loading saved world details…</p>:null;
}
