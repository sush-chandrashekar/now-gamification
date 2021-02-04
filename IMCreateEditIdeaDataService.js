var IMCreateEditIdeaDataService = Class.create();

IMCreateEditIdeaDataService.prototype = Object.extendsObject(IMCreateEditIdeaDataServiceSNC, {

  //Overriding createIdea here

 createIdea: function(ideaInfo) {

		//idea category sysid : forum sysid
        var newIdeaSysId;

        var liveProfileID = new global.GlobalKnowledgeUtil().getSessionProfile();

        var contentGr = new GlideRecord('sn_communities_content');
        contentGr.initialize();
        contentGr.content_name = 'idea';
        contentGr.content_type = 'c57a058adbcee054b2ca21fb1396199d'; //Idea Content type sys_id
        contentGr.profile = liveProfileID;
		contentGr.forum_id = '1b49911edb866454b2ca21fb1396192a'; //Product Enhancement forum sys_id
        var contentID = contentGr.insert();

        var ideaGr = new GlideRecord(this.ideaTableName);
        ideaGr.initialize();
        ideaGr.setNewGuidValue(ideaInfo.sysId); //Setting sys_id here so that to fetch related attachments
        ideaGr.module = ideaInfo.module;
        ideaGr.short_description = ideaInfo.title;
		ideaGr.video_url = ideaInfo.video_url;
        ideaGr.idea_description = ideaInfo.description;
        ideaGr.u_profile = liveProfileID;
        ideaGr.u_content = contentID;


        if (ideaGr.canCreate()) {
            newIdeaSysId = ideaGr.insert();
            //this.updateIdeaReferencesWithCategories(ideaInfo.categoryInfo,newIdeaSysId);
            var contentGrTwo = new GlideRecord('sn_communities_content');
            contentGrTwo.addQuery('sys_id', contentID);
			contentGrTwo.query();
            if (contentGrTwo.next()) {
                contentGrTwo.content_id = newIdeaSysId;
				contentGrTwo.state = 'published';
                contentGrTwo.update();
            }

            this.createM2MReferencesForIdeaAndCategories(ideaInfo.categoryInfo, newIdeaSysId);
            this.updateEditorAttachments(ideaInfo.editorImages, newIdeaSysId);
        }
        return {
            'sys_id': newIdeaSysId
        };
    },
    type: 'IMCreateEditIdeaDataService'
});