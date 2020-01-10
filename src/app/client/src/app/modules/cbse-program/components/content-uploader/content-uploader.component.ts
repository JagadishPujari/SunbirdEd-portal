import { Component, OnInit, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { FineUploader } from 'fine-uploader';
import { ToasterService, ConfigService, ResourceService } from '@sunbird/shared';
import { PublicDataService, UserService, ActionService, PlayerService, FrameworkService } from '@sunbird/core';
import { ProgramStageService } from '../../../program/services';
import * as _ from 'lodash-es';
import { catchError, map, first } from 'rxjs/operators';
import { throwError, Observable, from } from 'rxjs';
import { IContentUploadComponentInput} from '../../interfaces';
import { FormGroup, FormArray, FormBuilder, Validators, NgForm, FormControl } from '@angular/forms';
import { CbseProgramService } from '../../services/cbse-program/cbse-program.service';
import { HelperService } from '../../services/helper.service';
import { CollectionHierarchyService } from '../../services/collection-hierarchy/collection-hierarchy.service';

@Component({
  selector: 'app-content-uploader',
  templateUrl: './content-uploader.component.html',
  styleUrls: ['./content-uploader.component.scss']
})
export class ContentUploaderComponent implements OnInit, AfterViewInit {
  @ViewChild('modal') modal;
  @ViewChild('fineUploaderUI') fineUploaderUI: ElementRef;
  @ViewChild('qq-upload-actions') actionButtons: ElementRef;
  @ViewChild('titleTextArea') titleTextAreaa: ElementRef;
  @ViewChild('FormControl') FormControl: NgForm;
  // @ViewChild('contentTitle') contentTitle: ElementRef;
  @Input() contentUploadComponentInput: IContentUploadComponentInput;

  public sessionContext: any;
  public programContext: any;
  public templateDetails: any;
  public unitIdentifier: any;
  public formConfiguration: any;
  public actions: any;
  public textFields: Array<any>;
  public selectionFields: Array<any>;
  public multiSelectionFields: Array<any>;
  @Output() uploadedContentMeta = new EventEmitter<any>();
  public playerConfig;
  public showPreview = false;
  public resourceStatus;
  showForm;
  uploader;
  loading;
  contentURL;
  selectOutcomeOption = {};
  contentDetailsForm: FormGroup;
  textInputArr: FormArray;
  selectionArr: FormArray;
  multiSelectionArr: FormArray;
  formValues: any;
  contentMetaData;
  visibility: any;
  editTitle: string;
  showTextArea: boolean;
  changeFile_instance: boolean;
  showRequestChangesPopup = false;
  disableFormField: boolean;
  showReviewModal = false;
  showUploadModal = true;
  submitButton: boolean;
  uploadButton: boolean;

  constructor(public toasterService: ToasterService, private userService: UserService,
    private publicDataService: PublicDataService, public actionService: ActionService,
    public playerService: PlayerService, public configService: ConfigService, private formBuilder: FormBuilder,
    private cbseService: CbseProgramService, public frameworkService: FrameworkService,
    public programStageService: ProgramStageService, private helperService: HelperService,
    private collectionHierarchyService: CollectionHierarchyService, private cd: ChangeDetectorRef,
    private resourceService: ResourceService) { }

  ngOnInit() {
    this.sessionContext  = _.get(this.contentUploadComponentInput, 'sessionContext');
    this.templateDetails  = _.get(this.contentUploadComponentInput, 'templateDetails');
    this.unitIdentifier  = _.get(this.contentUploadComponentInput, 'unitIdentifier');
    this.programContext = _.get(this.contentUploadComponentInput, 'programContext');
    this.actions = _.get(this.contentUploadComponentInput, 'programContext.config.actions');
    if (_.get(this.contentUploadComponentInput, 'action') === 'preview') {
      this.showUploadModal = false;
      this.showPreview = true;
      this.cd.detectChanges();
      this.getUploadedContentMeta(_.get(this.contentUploadComponentInput, 'contentId'));
    }
  }

  ngAfterViewInit() {
    if (_.get(this.contentUploadComponentInput, 'action') !== 'preview') {
      this.initiateUploadModal();
    }
  }

  handleActionButtons() {
    this.visibility = {};
    // tslint:disable-next-line:max-line-length
    this.visibility['showChangeFile'] = (_.includes(this.actions.showChangeFile.roles, this.sessionContext.currentRoleId) && this.resourceStatus === 'Draft');
    // tslint:disable-next-line:max-line-length
    this.visibility['showRequestChanges'] = (_.includes(this.actions.showRequestChanges.roles, this.sessionContext.currentRoleId) && this.resourceStatus === 'Review');
    // tslint:disable-next-line:max-line-length
    this.visibility['showPublish'] = (_.includes(this.actions.showPublish.roles, this.sessionContext.currentRoleId) && this.resourceStatus === 'Review');
    // tslint:disable-next-line:max-line-length
    this.visibility['showSubmit'] = (_.includes(this.actions.showSubmit.roles, this.sessionContext.currentRoleId)  && this.resourceStatus === 'Draft');
    // tslint:disable-next-line:max-line-length
    this.visibility['showSave'] = (_.includes(this.actions.showSave.roles, this.sessionContext.currentRoleId) && this.resourceStatus === 'Draft');
    // tslint:disable-next-line:max-line-length
    this.visibility['showEdit'] = (_.includes(this.actions.showEdit.roles, this.sessionContext.currentRoleId) && this.resourceStatus === 'Draft');
  }

  initiateUploadModal() {
    this.uploader = new FineUploader({
      element: document.getElementById('upload-content-div'),
      template: 'qq-template-validation',
      multiple: false,
      autoUpload: false,
      request: {
        endpoint: '/assets/uploads'
      },
      validation: {
        allowedExtensions: (this.templateDetails.filesConfig.accepted.length === 3) ?
          this.templateDetails.filesConfig.accepted.split(' ') : this.templateDetails.filesConfig.accepted.split(', '),
        acceptFiles: this.templateDetails.mimeType ? this.templateDetails.mimeType.toString() : '',
        itemLimit: 1,
        sizeLimit: 52428800 // 50 MB = 50 * 1024 * 1024 bytes
      },
      messages: {
        sizeError: '{file} is too large, maximum file size is 50MB.'
      },
      callbacks: {
        onStatusChange: () => {

        },
        onSubmit: () => {
          this.uploadContent();
        }
      }
    });
    this.fineUploaderUI.nativeElement.remove();
  }

  uploadContent() {
    if (this.uploader.getFile(0) == null && !this.contentURL) {
      this.toasterService.error('File is required to upload');
      return;
    }
    let fileUpload = false;
    if (this.uploader.getFile(0) != null) {
      this.uploadButton = true;
      fileUpload = true;
    }
    const mimeType = fileUpload ? this.detectMimeType(this.uploader.getName(0)) : this.detectMimeType(this.contentURL);
    if (!mimeType) {
      this.toasterService.error('Invalid content type (supported type: pdf, epub, h5p, mp4, html-zip, webm)');
      return;
    } else {
      this.uploadByURL(fileUpload, mimeType);
    }
  }

  uploadByURL(fileUpload, mimeType) {
    if (fileUpload) {
      this.uploadFile(mimeType, this.contentUploadComponentInput.contentId);
    }
  }

  uploadFile(mimeType, contentId) {
    const contentType = mimeType;
    // document.getElementById('qq-upload-actions').style.display = 'none';
    this.loading = true;
    const option = {
      url: 'content/v3/upload/url/' + contentId,
      data: {
        request: {
          content: {
            fileName: this.uploader.getName(0)
          }
        }
      }
    };
    this.actionService.post(option).pipe(catchError(err => {
      const errInfo = { errorMsg: 'Unable to get pre_signed_url and Content Creation Failed, Please Try Again' };
      return throwError(this.cbseService.apiErrorHandling(err, errInfo));
  })).subscribe(res => {
      const signedURL = res.result.pre_signed_url;
      const config = {
        processData: false,
        contentType: contentType,
        headers: {
          'x-ms-blob-type': 'BlockBlob'
        }
      };
      this.uploadToBlob(signedURL, config).subscribe(() => {
        const fileURL = signedURL.split('?')[0];
        this.updateContentWithURL(fileURL, mimeType, contentId);
      });
    });
  }

  uploadToBlob(signedURL, config): Observable<any> {
    return this.actionService.http.put(signedURL, this.uploader.getFile(0), config).pipe(catchError(err => {
      const errInfo = { errorMsg: 'Unable to upload to Blob and Content Creation Failed, Please Try Again' };
      return throwError(this.cbseService.apiErrorHandling(err, errInfo));
  }), map(data => data));
  }

  updateContentWithURL(fileURL, mimeType, contentId) {
    const data = new FormData();
    data.append('fileUrl', fileURL);
    data.append('mimeType', mimeType);
    const config = {
      enctype: 'multipart/form-data',
      processData: false,
      contentType: false,
      cache: false
    };
    const option = {
      url: 'content/v3/upload/' + contentId,
      data: data,
      param: config
    };
    this.actionService.post(option).pipe(catchError(err => {
      const errInfo = { errorMsg: 'Unable to update pre_signed_url with Content Id and Content Creation Failed, Please Try Again' };
      return throwError(this.cbseService.apiErrorHandling(err, errInfo));
  })).subscribe(res => {
      this.toasterService.success('Content Successfully Uploaded...');
      this.getUploadedContentMeta(contentId);
      this.uploadedContentMeta.emit({
        contentId: contentId
      });
    });
  }

  getUploadedContentMeta(contentId) {
    const option = {
      url: 'content/v3/read/' + contentId
    };
    this.actionService.get(option).pipe(map(data => data.result.content), catchError(err => {
      const errInfo = { errorMsg: 'Unable to read the Content, Please Try Again' };
      return throwError(this.cbseService.apiErrorHandling(err, errInfo));
  })).subscribe(res => {
      const contentDetails = {
        contentId: contentId,
        contentData: res
      };
      this.contentMetaData = res;
      this.editTitle = this.contentMetaData.name;
      this.resourceStatus = this.contentMetaData.status;
      this.playerConfig = this.playerService.getConfig(contentDetails);
      this.playerConfig.context.pdata.pid = 'cbse-program-portal';
      this.showPreview = this.contentMetaData.artifactUrl ? true : false;
      this.showUploadModal = this.contentMetaData.artifactUrl ? false : true;
      if (this.showUploadModal) {
        return setTimeout(() => {
          this.initiateUploadModal();
        }, 0);
      }
      this.loading = false;
      this.handleActionButtons();
      // At the end of execution
      this.fetchFrameWorkDetails();
      this.manageFormConfiguration();
      this.cd.detectChanges();
    });
  }

  public closeUploadModal() {
    if (this.modal && this.modal.deny && this.changeFile_instance) {
      this.showPreview = true;
      this.showUploadModal = false;
      this.changeFile_instance = false;
    } else if (this.modal && this.modal.deny && this.showUploadModal) {
      this.modal.deny();
      this.programStageService.removeLastStage();
    }
  }

  detectMimeType(fileName) {
    const extn = fileName.split('.').pop();
    switch (extn) {
      case 'pdf':
        return 'application/pdf';
      case 'mp4':
        return 'video/mp4';
      case 'h5p':
        return 'application/vnd.ekstep.h5p-archive';
      case 'zip':
        return 'application/vnd.ekstep.html-archive';
      case 'epub':
        return 'application/epub';
      case 'webm':
        return 'video/webm';
      default:
        // return this.validateUploadURL(fileName);
    }
  }

  manageFormConfiguration() {
    this.showForm = true;
    // tslint:disable-next-line:max-line-length
    const compConfiguration = _.find(_.get(this.contentUploadComponentInput, 'programContext.config.components'), {compId: 'uploadContentComponent'});
    this.formConfiguration = compConfiguration.config.formConfiguration;
    this.textFields = _.filter(this.formConfiguration, {'inputType': 'text', 'visible': true});
    this.selectionFields = _.filter(this.formConfiguration, {'inputType': 'select', 'visible': true});
    this.multiSelectionFields = _.filter(this.formConfiguration, {'inputType': 'multiselect', 'visible': true});

    this.disableFormField = (this.sessionContext.currentRole === 'CONTRIBUTOR' && this.resourceStatus === 'Draft') ? false : true ;
    const formFields = _.map(this.formConfiguration, (formData) => {
      if (!formData.defaultValue) {
        return formData.code;
      }
      this.selectOutcomeOption[formData.code] = formData.defaultValue;
    });

    this.helperService.getLicences().subscribe((res) => {
      this.selectOutcomeOption['license'] = _.map(res.license, (license) => {
        return license.name;
      });
    });
    const topicTerm = _.find(this.sessionContext.topicList, { name: this.sessionContext.topic });
    if (topicTerm && topicTerm.associations) {
       this.selectOutcomeOption['learningOutcome'] = topicTerm.associations;
    }

    this.contentDetailsForm = this.formBuilder.group({
      textInputArr: this.formBuilder.array([ ]),
      selectionArr: this.formBuilder.array([ ]),
      multiSelectionArr: this.formBuilder.array([ ])
    });

    _.forEach(this.selectionFields, (obj) => {
      const controlName = {};
      const code = obj.code;
      const preSavedValues = {};
      // tslint:disable-next-line:max-line-length
      preSavedValues[code] = (this.contentMetaData && this.contentMetaData[code]) ? (Array.isArray(this.contentMetaData[code]) ? this.contentMetaData[code][0] : this.contentMetaData[code]) : '';
      // tslint:disable-next-line:max-line-length
      obj.required ? controlName[obj.code] = [preSavedValues[code], [Validators.required]] : controlName[obj.code] = preSavedValues[code];
      this.selectionArr = this.contentDetailsForm.get('selectionArr') as FormArray;
      this.selectionArr.push(this.formBuilder.group(controlName));
    });

    _.forEach(this.multiSelectionFields, (obj) => {
      const controlName = {};
      const code = obj.code;
      const preSavedValues = {};
      // tslint:disable-next-line:max-line-length
      preSavedValues[code] = (this.contentMetaData && this.contentMetaData[code] && this.contentMetaData[code].length) ? this.contentMetaData[code] : [];
      obj.required ? controlName[obj.code] = [preSavedValues[code], [Validators.required]] : controlName[obj.code] = [preSavedValues[code]];
      this.multiSelectionArr = this.contentDetailsForm.get('multiSelectionArr') as FormArray;
      this.multiSelectionArr.push(this.formBuilder.group(controlName));
    });

    _.forEach(this.textFields, (obj) => {
      const controlName = {};
      const code = obj.code;
      const preSavedValues = {};
      preSavedValues[code] = (this.contentMetaData && this.contentMetaData[code]) ? this.contentMetaData[code] : '';
      // tslint:disable-next-line:max-line-length
      obj.required ? controlName[obj.code] = [{value: preSavedValues[code], disabled: this.disableFormField}, Validators.required] : controlName[obj.code] = preSavedValues[code];
      this.textInputArr = this.contentDetailsForm.get('textInputArr') as FormArray;
      this.textInputArr.push(this.formBuilder.group(controlName));
    });
  }

  fetchFrameWorkDetails() {
    this.frameworkService.initialize(this.sessionContext.framework);
    this.frameworkService.frameworkData$.pipe(first()).subscribe((frameworkDetails: any) => {
      if (frameworkDetails && !frameworkDetails.err) {
        const frameworkData = frameworkDetails.frameworkdata[this.sessionContext.framework].categories;
        this.sessionContext.topicList = _.get(_.find(frameworkData, { code: 'topic' }), 'terms');
      }
    });
  }

  editContentTitle() {
    this.showTextArea = true;
    this.cd.detectChanges();
    this.titleTextAreaa.nativeElement.focus();
  }

  saveTitle() {
   if (this.editTitle && this.editTitle !== '') {
     if (this.editTitle === this.contentMetaData.name) {
       return;
     } else {
    const contentObj = {
      'versionKey': this.contentMetaData.versionKey,
      'name': this.editTitle
  };
  const request = {
    'content': contentObj
  };
  this.helperService.updateContent(request, this.contentMetaData.identifier).subscribe((res) => {
    this.contentMetaData.versionKey = res.result.versionKey;
    this.contentMetaData.name = this.editTitle;
    this.collectionHierarchyService.addResourceToHierarchy(this.sessionContext.collection, this.unitIdentifier, res.result.content_id)
    .subscribe((data) => {
        this.toasterService.success(this.resourceService.messages.smsg.m0060);
      }, (err) => {
        this.toasterService.error(this.resourceService.messages.fmsg.m0098);
      });
}, (err) => {
    this.editTitle = this.contentMetaData.name;
    this.toasterService.error(this.resourceService.messages.fmsg.m0098);
  });
  }
   } else {
    this.editContentTitle();
    this.toasterService.error(this.resourceService.messages.fmsg.m0076);
   }
  }

  saveContent(action?) {
    if (this.contentDetailsForm.valid && this.editTitle && this.editTitle !== '') {
      this.showTextArea = false;
      this.formValues = {};
        _.map(this.contentDetailsForm.value, (value, key) => { _.map(value, (obj) => { _.assign(this.formValues, obj); });
      });
      let contentObj = {
          'versionKey': this.contentMetaData.versionKey,
          'name': this.editTitle
      };
      contentObj = _.pickBy(_.assign(contentObj, this.formValues), _.identity);
      const request = {
        'content': contentObj
      };
      this.helperService.updateContent(request, this.contentMetaData.identifier).subscribe((res) => {
        this.contentMetaData.versionKey = res.result.versionKey;
        if (action === 'review') {
          this.sendForReview();
        } else if (this.sessionContext.collection && this.unitIdentifier && action !== 'review') {
          this.collectionHierarchyService.addResourceToHierarchy(this.sessionContext.collection, this.unitIdentifier, res.result.content_id)
          .subscribe((data) => {
            this.toasterService.success(this.resourceService.messages.smsg.m0060);
          }, (err) => {
            this.toasterService.error(this.resourceService.messages.fmsg.m0098);
          });
        } else {
          this.toasterService.success(this.resourceService.messages.smsg.m0060);
        }
      }, (err) => {
        this.toasterService.error(this.resourceService.messages.fmsg.m0098);
      });
    } else {
      // this.toasterService.error('Please Fill Mandatory Form-Fields...');
      this.toasterService.error(this.resourceService.messages.fmsg.m0076);
      this.markFormGroupTouched(this.contentDetailsForm);
    }
  }

  sendForReview() {
    this.helperService.reviewContent(this.contentMetaData.identifier)
       .subscribe((res) => {
        if (this.sessionContext.collection && this.unitIdentifier) {
          this.collectionHierarchyService.addResourceToHierarchy(this.sessionContext.collection, this.unitIdentifier, res.result.content_id)
          .subscribe((data) => {
            this.toasterService.success(this.resourceService.messages.smsg.m0061);
            this.programStageService.removeLastStage();
            this.uploadedContentMeta.emit({
              contentId: res.result.content_id
            });
          }, (err) => {
            this.toasterService.error(this.resourceService.messages.fmsg.m0099);
          });
        }
       }, (err) => {
        this.toasterService.error(this.resourceService.messages.fmsg.m0099);
       });
  }

  requestChanges() {
    if (this.FormControl.value.rejectComment) {
      this.helperService.submitRequestChanges(this.contentMetaData.identifier, this.FormControl.value.rejectComment)
      .subscribe(res => {
        this.showRequestChangesPopup = false;
        if (this.sessionContext.collection && this.unitIdentifier) {
          this.collectionHierarchyService.addResourceToHierarchy(this.sessionContext.collection, this.unitIdentifier, res.result.node_id)
          .subscribe((data) => {
            this.toasterService.success(this.resourceService.messages.smsg.m0062);
            this.programStageService.removeLastStage();
            this.uploadedContentMeta.emit({
              contentId: res.result.node_id
            });
          });
        }
      }, (err) => {
        this.toasterService.error(this.resourceService.messages.fmsg.m00100);
      });
    }
  }

  publichContent() {
    this.helperService.publishContent(this.contentMetaData.identifier, this.userService.userProfile.userId)
       .subscribe(res => {
        if (this.sessionContext.collection && this.unitIdentifier) {
          this.collectionHierarchyService.addResourceToHierarchy(this.sessionContext.collection, this.unitIdentifier, res.result.content_id)
          .subscribe((data) => {
            this.toasterService.success(this.resourceService.messages.smsg.m0063);
            this.programStageService.removeLastStage();
            this.uploadedContentMeta.emit({
              contentId: res.result.node_id
            });
          });
        }
      }, (err) => {
        this.toasterService.error(this.resourceService.messages.fmsg.m00101);
      });
  }

  markFormGroupTouched(formGroup: FormGroup) {
    (<any>Object).values(formGroup.controls).forEach(control => {
      control.markAsTouched();

      if (control.controls) {
        this.markFormGroupTouched(control);
      }
    });
  }

  changeFile() {
    this.changeFile_instance = true;
    this.uploadButton = false;
    this.showUploadModal = true;
    setTimeout(() => {
      this.initiateUploadModal();
    }, 0);
  }
}

