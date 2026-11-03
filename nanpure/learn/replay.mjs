// A cursor points to the deduction being explained; length is the completed board.
export class StepReplay {
 constructor(route){this.route=route;this.at=0;this.after=false;}
 get done(){return this.at===this.route.steps.length;}
 get applied(){return this.at+(this.after&&!this.done?1:0);}
 seek(value){this.at=Math.max(0,Math.min(this.route.steps.length,Math.trunc(Number(value)||0)));this.after=false;return this;}
 next(){return this.seek(this.at+1);}
 previous(){return this.seek(this.at-1);}
 flip(){if(!this.done)this.after=!this.after;return this;}
 advance(){if(this.done)return false;if(!this.after)this.after=true;else this.next();return true;}
}
