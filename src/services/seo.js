'use strict';
const fs=require('node:fs'),path=require('node:path');
const Content=require('../../public/content');
function detailHtml(kind,row,root,base){
  const config={news:['article.html','article-detail'],posts:['post.html','post-detail'],vendors:['vendor.html','vendor-detail'],properties:['property.html','property-detail']};
  const [file,id]=config[kind];let html=fs.readFileSync(path.join(root,file),'utf8');
  const title=row.title_zh||row.title||row.name_zh||row.name||'THE POINT 一点';
  const body=row.content_zh||row.content||row.intro_zh||row.description||row.tagline_zh||'';
  const description=String(row.excerpt||body||row.address||title).replace(/[#*\[\]]/g,'').replace(/\s+/g,' ').slice(0,160);
  let images=row.images||row.photos||[];if(typeof images==='string'){try{images=JSON.parse(images);}catch(_){images=[];}}
  const image=row.image||row.logo||images[0]||'media/logo.svg';
  const url=base+'/'+file+'?id='+row.id;
  const esc=Content.esc;
  const validImage=Content.safeUrl(image,true);
  const figure=validImage?`<figure><img src="${esc(validImage)}" alt="${esc(title)}" style="max-width:100%;height:auto" loading="eager"></figure>`:'';
  const detail=`<h1 class="art-title">${esc(title)}</h1>${row.address?`<p>${esc(row.address)} ${esc(row.suburb||'')}</p>`:''}${row.price_label?`<p>${esc(row.price_label)}${row.listing_kind==='rent'?(row.rent_period==='month'?' / 月':' / 周'):''}</p>`:''}${figure}<div class="article-content">${Content.render(body,row.content_format)}</div>`;
  const target=new RegExp('(<div\\b[^>]*\\bid="'+id+'"[^>]*>)[\\s\\S]*?(</div>)');
  html=html.replace(target,(_,open,close)=>open+detail+close);
  html=html.replace(/<title>[\s\S]*?<\/title>/i,()=>`<title>${esc(title)} · THE POINT 一点</title>`);
  for(const [attribute,key,value] of [['name','description',description],['property','og:title',title],['property','og:description',description],['property','og:image',new URL(validImage||'media/logo.svg',base+'/').href],['property','og:url',url]]){
    const tag=`<meta ${attribute}="${key}" content="${esc(value)}">`,pattern=new RegExp('<meta\\s+[^>]*'+attribute+'="'+key+'"[^>]*>','i');
    html=pattern.test(html)?html.replace(pattern,()=>tag):html.replace('</head>',()=>tag+'\n</head>');
  }
  const schema={'@context':'https://schema.org','@type':kind==='news'||kind==='posts'&&row.type==='article'?'Article':'WebPage',name:title,description,url};
  if(validImage)schema.image=new URL(validImage,base+'/').href;
  html=html.replace('</head>',()=>`<link rel="canonical" href="${esc(url)}"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>\n</head>`);
  return html;
}
module.exports={detailHtml};
