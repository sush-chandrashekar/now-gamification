var CommunityContentDaoImpl = Class.create();
CommunityContentDaoImpl.prototype = Object.extendsObject(CommunityContentDao,{

	  /**

//	  @override

     * Method to fetch contents from the community.
     * @param contentTypeFilters string : This param is used to pass additional filters for fetching
     *      content from the db. These filters are specific to the content type and together with this content type
     *      the filter would make sense. Examples of such filters would be : 'unanswered', 'solved' and so on.
     */
	getAllContents: function(start_from, last_record, forum, topic, type, sort, user, date_time, fetchAll, state, contentTypeFilters,featured) {
		var counter = 0,
			hasMoreRecords = true,
			content,
			countToReturn = last_record - start_from,
			limitCount = this.initial_fetch_size_multiple * countToReturn,//used for first time load
			firstPass = 0,
			contentsCount = 0,
			currentRow = 0,
			encodedQuery = '';
		var contentAuthor = [];
		var flatForums;
		var retObj = {
				"hasMoreRecords": hasMoreRecords,
				"contents": this.Results,
				"nextRecord": last_record
		};
		if(!this.commUtil.isNilOrEmpty(contentTypeFilters))
			contentTypeFilters = contentTypeFilters.toString();
		if(this.commUtil.isNilOrEmpty(forum)){
				flatForums = this.forumWrapper.getForumsFlat();
		}
		var primaryContentTypeIDs = [];
		if(type)type = type + '';
		if(this.commUtil.isNilOrEmpty(type)){
			primaryContentTypeIDs = this._getPrimaryContentTypes(forum);
		}else if(this.commUtil.isNilOrEmpty(forum)
			   || this.permissions.hasContentAccess(forum, type, 'Content_Read'))
			primaryContentTypeIDs.push(type + '');

		//Filter content type ids if contentTypeList is non empty.
		if(Array.isArray(this.contentTypeList) && this.contentTypeList.length ) {
			var i = primaryContentTypeIDs.length;
			while(i--) {
				if(this.contentTypeList.indexOf(primaryContentTypeIDs[i]) < 0) {
					primaryContentTypeIDs.splice(i, 1);
				}
			}
		}

		if(primaryContentTypeIDs.length == 0){
			//User doesn't have access to any content types
			return retObj;
		}
		//Fetch accessible forums by content type if forum is not given
		 if(this.commUtil.isNilOrEmpty(forum)) {
			 encodedQuery = this._getForumContentTypeEncodedQuery(primaryContentTypeIDs);
			 if(this.commUtil.isNilOrEmpty(encodedQuery))return retObj;
		 }
		while (counter <= countToReturn && hasMoreRecords) {
			content = null;
			content = new GlideRecord(CommunityConstants.CONTENT_TABLE);
			if (firstPass) {
				if(start_from == 0 && limitCount > -1){
					last_record = limitCount;
				}
				limitCount = -1;
				var requiredCount = countToReturn - counter;
				var probabilityRatio = ((last_record - start_from)/contentsCount);
				start_from = last_record;
				last_record = last_record + requiredCount + this.commUtil.getInterprettedOffset(requiredCount, probabilityRatio);
			}
			currentRow = start_from;
			firstPass = 1;
			if (!fetchAll) {
				if (!this.commUtil.isNilOrEmpty(forum)) {
					content.addQuery('forum_id', forum);
					content.addQuery('content_type', primaryContentTypeIDs);
				}else if(encodedQuery.length > 0)
					content.addEncodedQuery(encodedQuery);
				if (!this.commUtil.isNilOrEmpty(topic)) {
					content.addQuery('topics', 'CONTAINS', topic);
				}

				if(!this.commUtil.isNilOrEmpty(featured)){
				var authorFeaturedList	= new CommunityFeaturedContent().getFeaturedOfUser(user,type);
						content.addQuery('sys_id','IN',authorFeaturedList.join(','));
				}

				if (!this.commUtil.isNilOrEmpty(user)) {
					content.addQuery('profile', user);
				}
				if (!this.commUtil.isNilOrEmpty(date_time)) {
					content.addQuery('sys_updated_on', '<=', date_time);
				}
				if (contentTypeFilters) {
					// Before pulling any content or content type detail, verify if the content record matches the
					// content type filter criteria if any. Parse the filters and then set the appropriate filters.
					if(contentTypeFilters === 'solved'){
						var	question1 = content.addJoinQuery(CommunityConstants.QUESTION_TABLE, 'content_id', 'sys_id');
						question1.addCondition('accepted_answer', '!=', null);
					}
					else if(contentTypeFilters === 'unsolved'){
						var	question2 = content.addJoinQuery(CommunityConstants.QUESTION_TABLE, 'content_id', 'sys_id');
						question2.addCondition('accepted_answer', null);
					}
					else if(contentTypeFilters === 'unreplied'){
						content.addEncodedQuery('comment_count=0^ORcomment_count=NULL');
					}
				}
				if (sort == 'view')
					content.orderByDesc('view_count');
				if (sort == 'created')
					content.orderByDesc('sys_created_on');
				else
					content.orderByDesc('sys_updated_on');
			}

			content.addQuery('moderation_state', 'NOT IN', this.hiddenModerationStates);
			content.addQuery('active', true);
			if (state != 'all') {
				if (state)
					content.addQuery('state', state);
				else
					content.addQuery('state', 'published');
			} else {
				content.addQuery('state', '!=', 'draft');
			}
			if(start_from == 0 && limitCount > -1)
				content.setLimit(limitCount);
			else
				content.chooseWindow(start_from, last_record);
			content.query();
			contentsCount = 0;
			var totalRowCount = content.getRowCount();
			var userIds = [] ;
			while (content.next() && counter <= countToReturn) {
				//If start_from is with in the total row count but countToReturn is greater than total row count, Show More button should not appear
				currentRow++;
				if (currentRow >= totalRowCount)
						hasMoreRecords = false;

				//check if the accepted answer is active or not
				//Doing this check here instead of while querying, has major performance benefits.
				if(contentTypeFilters && contentTypeFilters === 'solved' && !this.isAnswered(content.content_id.accepted_answer + ''))
					continue;
				if(this.hideContentBasedOnWFState(content))
					continue;
				if(this.enableACL[content.content_type]){
					//evaluate ACL only if the property is turned on, otherwise rely on the permission layer security
					//that is built into the query condition using permission layer security (encodedQuery above)
					var content_type = content.content_id.getRefRecord();
					if(!content_type.canRead())
						continue;
				}
				if(counter == countToReturn) { //Loop for an extra record to determine visibility of show more button
					hasMoreRecords = true;
					counter++;
					continue;
				}
				this.content_obj = {};
				if (content.content_type == CommunityConstants.QUESTION_CONTENT_TYPE_ID)
					this._populateQuestionRelatedDetail(content, this.content_obj, "", true);
				else if (content.content_type == CommunityConstants.BLOG_CONTENT_TYPE_ID)
					this._populateBlogRelatedDetail(content, this.content_obj, true);
				else if (content.content_type == CommunityConstants.VIDEO_CONTENT_TYPE_ID)
					this._populateVideoRelatedDetail(content, this.content_obj, true);
				else if (content.content_type == CommunityConstants.EVENT_CONTENT_TYPE_ID)
					this._populateEventRelatedDetail(content, this.content_obj, true);
				else if (content.content_type == CommunityConstants.DOCUMENT_CONTENT_TYPE_ID)
					this._populateDocumentRelatedDetail(content, this.content_obj, true);
          //SUsh: Adding check for Idea Content Type
				else if (content.content_type == "c57a058adbcee054b2ca21fb1396199d")
					this._populateIdeaRelatedDetail(content, this.content_obj, true);

				// Due to the possible filter condition in the content type, the generic information about the content
				// should be called for after ascerting if the record needs to be considered.
				contentAuthor.push(content.getValue('profile'));
				//even though the content is updated, for the sort by created condition we dont
				//need to fetch the update user details, as update user details are not shown in the UI
				//hence dont need to execute the below if block for sort = created
				if((content.getValue('comment_count') > 0 || content.getValue('edited_on') != '') && sort != 'created') {
					var sysUpdateUser = content.getValue('sys_updated_by');
					userIds.push(sysUpdateUser);
					this.content_obj.updateUserName = sysUpdateUser;
				}
				this.content_obj.userAvatarObject = {};
                		this.content_obj.userAvatarObject.userId = content.getValue('profile');
				this.content_obj.forum = this._getForumDetail(content);
				this.content_obj.content_type = this._getContentTypeDetail(content);
				this.content_obj.view_count = content.view_count + '' || 0;
				this.content_obj.like_count = content.upvote_count + '' || 0;

				this.content_obj.comment_count = content.comment_count + '' || 0;
				//created date should be utc
				//if the sort is based on the created by date then the sys_created_on date should be passed
				var displayDateVariable = 'sys_updated_on';
				if(sort == 'created')
					displayDateVariable = 'sys_created_on';
				this.content_obj.updated_date = content.getValue(displayDateVariable) + '';
				this.content_obj.published_date = content.getValue("sys_created_on") + '';
				this.Results.push(this.content_obj);
				contentsCount++;
				counter++;
			}
			if(userIds.length > 0)
				this._buildContentUpdateUser(this.Results,userIds);
			//If the start_from crosses the total row count but the countToReturn is not fetched, Show More should not appear
			if (totalRowCount == 0 || totalRowCount <= start_from) {
					hasMoreRecords = false;
			}
		}
		currentRow--;
		this._populateUserDataForContentFeed(contentAuthor, this.Results);
		retObj.hasMoreRecords = hasMoreRecords;
		retObj.nextRecord = currentRow;
		if(flatForums && flatForums.data
		   && flatForums.data.length > 0){
			retObj.flatForums = flatForums.data;
		}
		return retObj;
	},
//SUSH: custom function to fetch idea details
    _populateIdeaRelatedDetail: function(content, result, getLightWeightObj) {
        result.sys_id = content.content_id + '';
        result.url = "/idea.do?sys_id=" + result.sys_id;
        result.title = content.content_id.short_description + '';
		result.state = content.content_id.state.getDisplayValue();


        if(!getLightWeightObj)
			result.description = content.content_id.idea_description + '';

    },


    type: 'CommunityContentDaoImpl'
});